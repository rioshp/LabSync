import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Text } from 'react-native';

import { formatDateTime } from '@/features/academic/time';
import { AuthButton, AuthError, AuthField } from '@/components/auth-screen';
import { SessionStatusStyles } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { mutate, mutationError } from '@/lib/mutations';

import {
  permitStatuses,
  sentiments,
  useLive,
  type Attendance,
  type ClassInfo,
  type Permit,
  type Review,
  type Session,
} from './data';
import { Card, Feedback, Page, styles } from './ui';
import { useReviewAccess } from './use-review-access';

function useContextIds() {
  const { classId, sessionId } = useLocalSearchParams<{ classId?: string; sessionId?: string }>();
  const { user, role } = useAuth();
  return { uid: role === 'praktikan' ? user?.uid : undefined, classId, sessionId };
}

// Firestore memperbolehkan pembacaan dokumen sendiri meski catatan belum dibuat.
function ownRecord(path: 'attendances' | 'permits' | 'reviews', uid: string, sessionId: string) {
  return { kind: 'doc' as const, path: `${path}/${sessionId}~${uid}` };
}

export function StudentSession() {
  const { uid, classId, sessionId } = useContextIds();
  if (!uid || !classId || !sessionId)
    return (
      <Page title="Detail sesi" detail>
        <Card title="Sesi tidak ditemukan." />
      </Page>
    );
  return (
    <SessionDetail
      key={JSON.stringify([uid, classId, sessionId])}
      uid={uid}
      classId={classId}
      sessionId={sessionId}
    />
  );
}

function SessionDetail({
  uid,
  classId,
  sessionId,
}: {
  uid: string;
  classId: string;
  sessionId: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [notice, setNotice] = useState('');
  const [mutationErrorMessage, setMutationErrorMessage] = useState<string | null>(null);

  const classInfo = useLive<ClassInfo>(uid, { kind: 'doc', path: 'classes/' + classId }, attempt);
  const session = useLive<Session>(
    uid,
    { kind: 'doc', path: 'classes/' + classId + '/sessions/' + sessionId },
    attempt,
  );
  const attendance = useLive<Attendance>(uid, ownRecord('attendances', uid, sessionId), attempt);
  const permits = useLive<Permit>(uid, ownRecord('permits', uid, sessionId), attempt);
  const connectedData = [classInfo, session, attendance, permits];
  const error = connectedData.find((source) => source.error)?.error ?? null;
  const loading = connectedData.some((source) => source.loading);
  const offline = connectedData.some((source) => source.offline);
  const current = session.data;
  const context = classInfo.data;
  const present = attendance.data;
  const permit = permits.data;
  const permitBlocks = permit && permit.status !== 'rejected';
  const canReview = !!present && current?.status === 'closed';
  const reviews = useLive<Review>(
    uid,
    canReview ? ownRecord('reviews', uid, sessionId) : null,
    attempt,
  );

  async function checkIn() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMutationErrorMessage(null);
    setNotice('');
    try {
      await mutate('checkIn', { classId, sessionId });
      setNotice('Presensi tersimpan.');
    } catch (error) {
      setMutationErrorMessage(mutationError(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Page title="Detail sesi" detail>
      <Feedback
        loading={loading}
        offline={offline}
        error={error}
        retry={() => setAttempt((n) => n + 1)}
      />
      {!loading && !error && (!current || !context) && <Card title="Sesi tidak ditemukan." />}
      {current && context && (
        <Card title={current.moduleTitle}>
          <Text style={styles.text}>{context.name}</Text>
          <Text style={styles.text}>{current.room}</Text>
          <Text style={styles.text}>
            {formatDateTime(current.startsAt.toDate(), context.timeZone)} –{' '}
            {formatDateTime(current.endsAt.toDate(), context.timeZone)}
          </Text>
          <Text style={styles.badge}>{SessionStatusStyles[current.status].label}</Text>
          {present && (
            <Text style={styles.text}>
              Hadir · {formatDateTime(present.checkedInAt.toDate(), context.timeZone)}
            </Text>
          )}
          {permit && <Text style={styles.text}>Izin · {permitStatuses[permit.status]}</Text>}
          {!loading && !error && !present && !permitBlocks && current.status === 'open' && (
            <AuthButton
              title="Presensi sekarang"
              onPress={checkIn}
              busy={busy}
              disabled={offline || !!notice}
            />
          )}
          {!loading &&
            !error &&
            !present &&
            !permit &&
            (current.status === 'scheduled' || current.status === 'open') && (
              <AuthButton
                title="Ajukan izin"
                disabled={offline || busy || !!notice}
                onPress={() =>
                  router.push({
                    pathname: '/praktikan/ajukan-izin',
                    params: { classId, sessionId },
                  })
                }
              />
            )}
          {canReview && !reviews.loading && !reviews.error && (
            <AuthButton
              title={reviews.data ? 'Lihat ulasan' : 'Tulis ulasan'}
              onPress={() =>
                router.push({ pathname: '/praktikan/ulasan', params: { classId, sessionId } })
              }
            />
          )}
          {canReview && reviews.error && (
            <Feedback {...reviews} retry={() => setAttempt((n) => n + 1)} />
          )}
          {notice && !present ? (
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              {notice}
            </Text>
          ) : null}
          <AuthError message={mutationErrorMessage} />
        </Card>
      )}
    </Page>
  );
}

export function StudentForm({ mode }: { mode: 'permit' | 'review' }) {
  const { uid, classId, sessionId } = useContextIds();
  if (!uid || !classId || !sessionId) return <Page title="Sesi tidak ditemukan" detail />;
  return (
    <ParticipationForm
      key={JSON.stringify([uid, classId, sessionId, mode])}
      uid={uid}
      classId={classId}
      sessionId={sessionId}
      mode={mode}
    />
  );
}

function ParticipationForm({
  uid,
  classId,
  sessionId,
  mode,
}: {
  uid: string;
  classId: string;
  sessionId: string;
  mode: 'permit' | 'review';
}) {
  const review = mode === 'review';
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = useLive<Permit | Review>(
    uid,
    ownRecord(review ? 'reviews' : 'permits', uid, sessionId),
    attempt,
  );
  const record = previous.data;
  const canCreate = !previous.loading && !previous.error && !record && !sent;
  const attendanceId = sessionId + '~' + uid;
  const checkingReview = review && canCreate && !previous.offline;
  const reviewAccess = useReviewAccess(checkingReview ? [attendanceId] : [], attempt);
  const access = reviewAccess.access?.[attendanceId];
  const reviewAllowed = access?.state === 'ready' && access.classId === classId;
  const reviewAlreadySubmitted = access?.state === 'submitted' && access.classId === classId;
  const showForm = canCreate && (!review || reviewAllowed);

  async function send() {
    if (lock.current) return;
    const value = text.trim();
    if (value.length < 10) return setError('Isi minimal 10 karakter.');
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await mutate(review ? 'submitReview' : 'submitPermit', {
        classId,
        sessionId,
        [review ? 'text' : 'reason']: value,
      });
      setSent(true);
    } catch (error) {
      setError(mutationError(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Page title={review ? 'Ulasan sesi' : 'Ajukan izin'} detail>
      <Feedback {...previous} retry={() => setAttempt((n) => n + 1)} />
      {record && 'analysisStatus' in record && (
        <Card title="Ulasan kamu">
          <Text style={styles.text}>{record.text}</Text>
          <Text style={styles.badge}>
            {record.analysisStatus === 'succeeded' && record.sentiment
              ? sentiments[record.sentiment]
              : {
                  pending: 'Menunggu analisis',
                  processing: 'Sedang dianalisis',
                  failed: 'Analisis gagal',
                  succeeded: 'Hasil belum tersedia',
                }[record.analysisStatus]}
          </Text>
        </Card>
      )}
      {record && 'reason' in record && (
        <Card title={permitStatuses[record.status]}>
          <Text style={styles.text}>{record.reason}</Text>
          {record.decisionNote && (
            <Text style={styles.text}>Catatan asisten · {record.decisionNote}</Text>
          )}
        </Card>
      )}
      {sent && !record && (
        <Card title={review ? 'Ulasan tersimpan.' : 'Izin tersimpan. Menunggu keputusan.'} />
      )}
      {checkingReview &&
        !reviewAllowed &&
        (reviewAlreadySubmitted ? (
          <Card title="Memuat ulasan…" />
        ) : reviewAccess.access ? (
          <Card title="Ulasan belum tersedia">
            <Text style={styles.text}>
              Ulasan dapat dikirim setelah sesi yang kamu hadiri selesai.
            </Text>
          </Card>
        ) : (
          <Feedback
            loading={!reviewAccess.error}
            offline={false}
            error={reviewAccess.error}
            retry={() => setAttempt((n) => n + 1)}
          />
        ))}
      {showForm && (
        <Card>
          {review && (
            <Text style={styles.text}>Hindari mencantumkan informasi pribadi dalam ulasan.</Text>
          )}
          <AuthField
            label={review ? 'Ulasan' : 'Alasan ketidakhadiran'}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            editable={!busy}
          />
          {text.trim().length < 10 && <Text style={styles.text}>Minimal 10 karakter.</Text>}
          <AuthError message={error} />
          <AuthButton
            title={review ? 'Kirim ulasan' : 'Kirim izin'}
            onPress={send}
            busy={busy}
            disabled={previous.offline || text.trim().length < 10}
          />
        </Card>
      )}
    </Page>
  );
}

export function StudentHistory() {
  const { user, role } = useAuth();
  if (!user || role !== 'praktikan') return null;
  return <History key={user.uid} uid={user.uid} />;
}

function History({ uid }: { uid: string }) {
  const [attempt, setAttempt] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const filters = [{ field: 'studentUid', value: uid }];
  const attendances = useLive<Attendance[]>(
    uid,
    { kind: 'list', path: 'attendances', filters, order: 'checkedInAt', pageSize },
    attempt,
  );
  const permits = useLive<Permit[]>(
    uid,
    { kind: 'list', path: 'permits', filters, order: 'submittedAt', pageSize },
    attempt,
  );
  const retry = () => setAttempt((n) => n + 1);
  const reviewAccess = useReviewAccess(
    attendances.offline ? [] : (attendances.data ?? []).map((item) => item.id),
    attempt,
  );
  return (
    <Page>
      <Text accessibilityRole="header" style={styles.heading}>
        Kehadiran
      </Text>
      <Feedback {...attendances} retry={retry} />
      {attendances.data?.length === 0 && <Card title="Belum ada presensi." />}
      {reviewAccess.error && (
        <Feedback loading={false} offline={false} error={reviewAccess.error} retry={retry} />
      )}
      {attendances.data?.map((item) => (
        <Card key={item.id} title={item.sessionSnapshot.moduleTitle}>
          <Text style={styles.text}>{item.sessionSnapshot.className}</Text>
          <Text style={styles.text}>
            {formatDateTime(item.checkedInAt.toDate(), item.sessionSnapshot.timeZone)}
          </Text>
          {reviewAccess.access?.[item.id]?.state === 'submitted' ||
          reviewAccess.access?.[item.id]?.state === 'ready' ? (
            <AuthButton
              title={
                reviewAccess.access[item.id].state === 'submitted' ? 'Lihat ulasan' : 'Tulis ulasan'
              }
              onPress={() =>
                router.push({
                  pathname: '/praktikan/ulasan',
                  params: { classId: item.classId, sessionId: item.sessionId },
                })
              }
            />
          ) : null}
        </Card>
      ))}

      <Text accessibilityRole="header" style={styles.heading}>
        Pengajuan izin
      </Text>
      <Feedback {...permits} retry={retry} />
      {permits.data?.length === 0 && <Card title="Belum ada pengajuan izin." />}
      {permits.data?.map((permit) => (
        <Card key={permit.id} title={permit.sessionSnapshot.moduleTitle}>
          <Text style={styles.text}>{permit.sessionSnapshot.className}</Text>
          <Text style={styles.badge}>{permitStatuses[permit.status]}</Text>
          <Text style={styles.text}>{permit.reason}</Text>
          {permit.decisionNote && (
            <Text style={styles.text}>Catatan asisten · {permit.decisionNote}</Text>
          )}
        </Card>
      ))}
      {(attendances.data?.length === pageSize || permits.data?.length === pageSize) && (
        <AuthButton title="Tampilkan lebih banyak" onPress={() => setPageSize((n) => n + 20)} />
      )}
    </Page>
  );
}
