import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Text } from 'react-native';
import { AuthButton, AuthError } from '@/components/auth-screen';
import { formatDateTime } from '@/features/academic/time';
import { LocationStatus } from '@/features/labs/location-status';
import { useDeviceLocation } from '@/features/labs/useLabs';
import { useAuth } from '@/hooks/useAuth';
import {
  evaluateLabProximity,
  getFreshLocation,
  LocationError,
  type Coordinates,
} from '@/lib/location';
import { mutate, mutationError } from '@/lib/mutations';
import { useLive, type Attendance, type ClassInfo, type Permit, type Session } from './data';
import { Card, Feedback, Page, styles } from './ui';

type CheckInLab = Coordinates & { name: string; radiusMeters: number; status: 'active' | 'archived' };

export default function StudentCheckIn() {
  const { user, role } = useAuth();
  const params = useLocalSearchParams<{ classId?: string; sessionId?: string }>();
  const classId = typeof params.classId === 'string' ? params.classId : '';
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  if (
    !user ||
    role !== 'praktikan' ||
    !classId ||
    !sessionId ||
    classId.includes('/') ||
    sessionId.includes('/')
  ) {
    return (
      <Page detail title="Presensi">
        <Card title="Sesi tidak dapat diakses." />
      </Page>
    );
  }
  return (
    <CheckIn
      key={`${user.uid}:${classId}:${sessionId}`}
      uid={user.uid}
      classId={classId}
      sessionId={sessionId}
    />
  );
}

function CheckIn({ uid, classId, sessionId }: { uid: string; classId: string; sessionId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const session = useLive<Session>(
    uid,
    { kind: 'doc', path: `classes/${classId}/sessions/${sessionId}` },
    attempt,
  );
  const context = useLive<ClassInfo>(uid, { kind: 'doc', path: `classes/${classId}` }, attempt);
  const attendance = useLive<Attendance>(
    uid,
    { kind: 'doc', path: `attendances/${sessionId}~${uid}` },
    attempt,
  );
  const permit = useLive<Permit>(
    uid,
    { kind: 'doc', path: `permits/${sessionId}~${uid}` },
    attempt,
  );
  const labId = session.data?.labId;
  const lab = useLive<CheckInLab>(
    uid,
    labId ? { kind: 'doc', path: `labs/${labId}` } : null,
    attempt,
  );
  const present = !!attendance.data || sent;
  const blockedPermit = permit.data?.status === 'pending' || permit.data?.status === 'approved';
  const eligible =
    !present && !blockedPermit && session.data?.status === 'open' && lab.data?.status === 'active';
  const location = useDeviceLocation(eligible);
  const sources = [session, context, attendance, permit, lab];
  const loading = sources.some((source) => source.loading);
  const dataError = sources.find((source) => source.error)?.error ?? null;
  const offline = sources.some((source) => source.offline);
  let proximity: ReturnType<typeof evaluateLabProximity> | null = null;
  let locationMessage: string | null = null;
  if (eligible && location.sample && lab.data) {
    try {
      proximity = evaluateLabProximity(
        location.sample,
        lab.data,
        lab.data.radiusMeters,
        location.now,
      );
    } catch (err) {
      locationMessage = err instanceof Error ? err.message : 'Lokasi belum siap.';
    }
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const sample = await getFreshLocation();
      await mutate('checkIn', { classId, sessionId, location: sample });
      setSent(true);
    } catch (err) {
      setError(err instanceof LocationError ? err.message : mutationError(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Page detail title="Presensi lokasi" subtitle={session.data?.moduleTitle}>
      <Feedback
        loading={loading}
        error={dataError}
        offline={offline}
        retry={() => setAttempt((n) => n + 1)}
      />
      {context.data && session.data ? (
        <Card title={context.data.name}>
          <Text style={styles.text}>{lab.data?.name ?? session.data.room}</Text>
          <Text style={styles.muted}>
            {formatDateTime(session.data.startsAt.toDate(), context.data.timeZone)}
          </Text>
          <Text style={styles.badgeSoft}>
            Status sesi:{' '}
            {session.data.status === 'open'
              ? 'Dibuka'
              : session.data.status === 'closed'
                ? 'Selesai'
                : session.data.status === 'scheduled'
                  ? 'Terjadwal'
                  : 'Dibatalkan'}
          </Text>
        </Card>
      ) : null}
      {present ? (
        <Card title="Kehadiran sudah tercatat">
          <Text style={styles.text}>
            {attendance.data && context.data
              ? formatDateTime(attendance.data.checkedInAt.toDate(), context.data.timeZone)
              : 'Presensi berhasil disimpan di server.'}
          </Text>
        </Card>
      ) : !loading && !dataError ? (
        <Card title="Pemeriksaan lokasi">
          {blockedPermit ? (
            <Text style={styles.text}>
              Izin menunggu atau sudah disetujui. Presensi tidak tersedia.
            </Text>
          ) : session.data?.status !== 'open' ? (
            <Text style={styles.text}>Presensi hanya tersedia saat sesi dibuka asisten.</Text>
          ) : !labId ? (
            <Text style={styles.text}>Lokasi sesi belum disiapkan asisten.</Text>
          ) : !lab.data || lab.data.status !== 'active' ? (
            <Text style={styles.text}>Laboratorium tidak aktif. Hubungi asisten.</Text>
          ) : (
            <>
              <Text style={styles.text}>
                Batas area presensi: {lab.data.radiusMeters} meter.
              </Text>
              {proximity ? (
                <Text style={styles.text}>
                  {proximity.inside ? 'Di dalam' : 'Di luar'} area · jarak{' '}
                  {Math.round(proximity.distanceMeters)} m.
                </Text>
              ) : null}
              {location.sample?.accuracy != null ? (
                <Text style={styles.muted}>
                  Akurasi GPS ±{Math.round(location.sample.accuracy)} m
                </Text>
              ) : null}
              <AuthError message={locationMessage} />
              <LocationStatus location={location} />
              <AuthButton
                title="Konfirmasi presensi"
                busy={busy}
                disabled={offline || !proximity?.inside || !!locationMessage}
                onPress={() => void submit()}
              />
            </>
          )}
        </Card>
      ) : null}
      <AuthError message={error} />
    </Page>
  );
}
