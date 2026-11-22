import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { classLocalDateTime, formatDateTime } from '@/features/academic/time';
import { useStudentClasses } from '@/features/academic/useAcademic';
import { AuthButton, AuthError, AuthField } from '@/components/auth-screen';
import {
  ConcentricArcOverlay,
  CornerDotAccent,
  DarkContourOverlay,
  DarkGradientOverlay,
  DiagonalHatchOverlay,
  ScreenBackdrop,
} from '@/components/labsync-brand';
import { BrandColors, SessionStatusStyles } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { mutate, mutationError } from '@/lib/mutations';

import {
  permitStatuses,
  useLive,
  type Attendance,
  type ClassInfo,
  type Permit,
  type Review,
  type Session,
} from './data';
import { Card, Feedback, Page, styles } from './ui';
import { useReviewAccess } from './use-review-access';

const ARROW_BACK_LIGHT = require('../../../assets/images/arrow-back-light.svg');

function formatSessionDate(date: Date, timeZone: string) {
  try {
    return date.toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone,
    });
  } catch {
    return classLocalDateTime(date, timeZone).date;
  }
}

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
      <Page title="Detail sesi" detail clean>
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
  const canReview = !!present && (current?.status === 'open' || current?.status === 'closed');
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

  const statusInfo = current ? SessionStatusStyles[current.status] : null;
  const startLocal =
    current && context ? classLocalDateTime(current.startsAt.toDate(), context.timeZone) : null;
  const endLocal =
    current && context ? classLocalDateTime(current.endsAt.toDate(), context.timeZone) : null;

  return (
    <Page
      title={current && context ? undefined : 'Detail sesi'}
      detail
      clean
      headerRight={
        statusInfo && current ? (
          <View
            style={[
              local.statusChip,
              { backgroundColor: statusInfo.bg, borderColor: statusInfo.border },
            ]}
          >
            <Text style={[local.statusChipText, { color: statusInfo.text }]}>
              {current.status === 'open' ? `● ${statusInfo.label}` : statusInfo.label}
            </Text>
          </View>
        ) : undefined
      }
    >
      <Feedback
        loading={loading}
        offline={offline}
        error={error}
        retry={() => setAttempt((n) => n + 1)}
      />
      {!loading && !error && (!current || !context) ? <Card title="Sesi tidak ditemukan." /> : null}
      {current && context && startLocal && endLocal ? (
        <View style={local.cleanStack}>
          <View style={local.sessionHeadBlock}>
            <Text style={local.sessionEyebrow}>{context.name.toUpperCase()}</Text>
            <Text accessibilityRole="header" style={local.sessionHeading}>
              {current.moduleTitle}
            </Text>
          </View>

          <View style={local.infoBox}>
            <View style={local.infoRow}>
              <SymbolView
                name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
                size={15}
                tintColor={BrandColors.ink}
              />
              <Text style={local.infoText}>
                {formatSessionDate(current.startsAt.toDate(), context.timeZone)}
              </Text>
            </View>
            <View style={local.infoRow}>
              <SymbolView
                name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
                size={15}
                tintColor={BrandColors.ink}
              />
              <Text style={local.infoText}>
                {startLocal.time} – {endLocal.time}
              </Text>
            </View>
            <View style={local.infoRow}>
              <SymbolView
                name={{ ios: 'mappin.and.ellipse', android: 'place', web: 'place' }}
                size={15}
                tintColor={BrandColors.ink}
              />
              <Text style={local.infoText}>Ruang {current.room}</Text>
            </View>
          </View>

          {present ? (
            <View style={local.statusBox}>
              <Text style={styles.badge}>✓ Hadir</Text>
              <Text style={styles.text}>
                Tercatat pada {formatDateTime(present.checkedInAt.toDate(), context.timeZone)}
              </Text>
            </View>
          ) : null}

          {permit ? (
            <View style={local.statusBox}>
              <Text style={permit.status === 'rejected' ? styles.badgeDanger : styles.badgeSoft}>
                Izin · {permitStatuses[permit.status]}
              </Text>
              {permit.decisionNote ? (
                <Text style={styles.muted}>Catatan asisten · {permit.decisionNote}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={local.actionStack}>
            {!loading && !error && !present && !permitBlocks && current.status === 'open' ? (
              <AuthButton
                title="Presensi sekarang"
                onPress={checkIn}
                busy={busy}
                disabled={offline || !!notice}
              />
            ) : null}
            {!loading &&
            !error &&
            !present &&
            !permit &&
            (current.status === 'scheduled' || current.status === 'open') ? (
              <AuthButton
                title="Ajukan izin"
                variant="outline"
                disabled={offline || busy || !!notice}
                onPress={() =>
                  router.push({
                    pathname: '/praktikan/ajukan-izin',
                    params: { classId, sessionId },
                  })
                }
              />
            ) : null}
            {canReview && !reviews.loading && !reviews.error ? (
              <AuthButton
                title={reviews.data ? 'Lihat ulasan' : 'Tulis ulasan'}
                variant={reviews.data ? 'outline' : 'primary'}
                onPress={() =>
                  router.push({ pathname: '/praktikan/ulasan', params: { classId, sessionId } })
                }
              />
            ) : null}
          </View>

          {canReview && reviews.error ? (
            <Feedback {...reviews} retry={() => setAttempt((n) => n + 1)} />
          ) : null}
          {notice && !present ? (
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              {notice}
            </Text>
          ) : null}
          <AuthError message={mutationErrorMessage} />
        </View>
      ) : null}
    </Page>
  );
}

export function StudentForm({ mode }: { mode: 'permit' | 'review' }) {
  const { uid, classId, sessionId } = useContextIds();
  if (!uid || !classId || !sessionId) return <Page title="Sesi tidak ditemukan" detail clean />;
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
    <Page
      title={review ? 'Ulasan sesi' : 'Ajukan izin'}
      subtitle={
        review
          ? 'Bagikan pengalaman praktikum kamu untuk sesi ini.'
          : 'Tuliskan alasan ketidakhadiran yang jelas untuk ditinjau asisten.'
      }
      headerRight={<DiagonalHatchOverlay inline size={38} />}
      detail
      clean
    >
      <Feedback {...previous} retry={() => setAttempt((n) => n + 1)} />
      {record && 'analysisStatus' in record ? (
        <View style={local.cleanStack}>
          <View style={local.reviewQuoteBox}>
            <Text style={local.sessionEyebrow}>ULASAN KAMU</Text>
            <Text style={styles.text}>{record.text}</Text>
          </View>
        </View>
      ) : null}
      {record && 'reason' in record ? (
        <View style={local.cleanStack}>
          <View style={local.reviewQuoteBox}>
            <Text style={record.status === 'rejected' ? styles.badgeDanger : styles.badgeSoft}>
              Izin · {permitStatuses[record.status]}
            </Text>
            <Text style={styles.text}>{record.reason}</Text>
            {record.decisionNote ? (
              <Text style={styles.muted}>Catatan asisten · {record.decisionNote}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {sent && !record ? (
        <View style={local.reviewQuoteBox}>
          <Text style={styles.heading}>
            {review ? 'Ulasan tersimpan.' : 'Izin tersimpan. Menunggu keputusan.'}
          </Text>
        </View>
      ) : null}
      {checkingReview &&
        !reviewAllowed &&
        (reviewAlreadySubmitted ? (
          <View style={local.reviewQuoteBox}>
            <Text style={styles.heading}>Memuat ulasan…</Text>
          </View>
        ) : reviewAccess.access ? (
          <View style={local.reviewQuoteBox}>
            <Text style={styles.heading}>Ulasan belum tersedia</Text>
            <Text style={styles.text}>
              Ulasan dapat dikirim setelah kamu presensi pada sesi yang sudah dibuka.
            </Text>
          </View>
        ) : (
          <Feedback
            loading={!reviewAccess.error}
            offline={false}
            error={reviewAccess.error}
            retry={() => setAttempt((n) => n + 1)}
          />
        ))}
      {showForm ? (
        <View style={local.cleanStack}>
          {review ? (
            <Text style={styles.muted}>Hindari mencantumkan informasi pribadi dalam ulasan.</Text>
          ) : null}
          <AuthField
            label={review ? 'Ulasan' : 'Alasan ketidakhadiran'}
            value={text}
            onChangeText={setText}
            placeholder={
              review ? 'Tuliskan ulasan kamu minimal 10 karakter…' : 'Tuliskan alasan izin…'
            }
            multiline
            maxLength={1000}
            editable={!busy}
          />
          {text.trim().length < 10 ? <Text style={styles.muted}>Minimal 10 karakter.</Text> : null}
          <AuthError message={error} />
          <AuthButton
            title={review ? 'Kirim ulasan' : 'Kirim izin'}
            onPress={send}
            busy={busy}
            disabled={previous.offline || text.trim().length < 10}
          />
        </View>
      ) : null}
    </Page>
  );
}

type StudentClassSummary = {
  classId: string;
  name: string;
  active: boolean;
  presentCount: number;
  permitCount: number;
};

/** Tab Kelas Saya — menampilkan kelas aktif & kelas terdahulu dengan ringkasan X Hadir · Y Izin. */
export function StudentClasses() {
  const { user, role } = useAuth();
  if (!user || role !== 'praktikan') return null;
  return <StudentClassesContent key={user.uid} uid={user.uid} />;
}

function StudentClassesContent({ uid }: { uid: string }) {
  const [attempt, setAttempt] = useState(0);
  const enrolled = useStudentClasses(uid);
  const filters = [{ field: 'studentUid', value: uid }];
  const attendances = useLive<Attendance[]>(
    uid,
    { kind: 'list', path: 'attendances', filters, order: 'checkedInAt', pageSize: 200 },
    attempt,
  );
  const permits = useLive<Permit[]>(
    uid,
    { kind: 'list', path: 'permits', filters, order: 'submittedAt', pageSize: 200 },
    attempt,
  );

  const retry = () => {
    enrolled.retry();
    setAttempt((n) => n + 1);
  };

  const countMap = new Map<string, { present: number; permit: number; fallbackName: string }>();
  for (const item of attendances.data ?? []) {
    const prev = countMap.get(item.classId) ?? {
      present: 0,
      permit: 0,
      fallbackName: item.sessionSnapshot.className,
    };
    prev.present += 1;
    countMap.set(item.classId, prev);
  }
  for (const item of permits.data ?? []) {
    const prev = countMap.get(item.classId) ?? {
      present: 0,
      permit: 0,
      fallbackName: item.sessionSnapshot.className,
    };
    prev.permit += 1;
    countMap.set(item.classId, prev);
  }

  const activeIds = new Set(enrolled.value.map((c) => c.id));
  const activeClasses: StudentClassSummary[] = enrolled.value.map((cls) => {
    const counts = countMap.get(cls.id);
    return {
      classId: cls.id,
      name: cls.name,
      active: true,
      presentCount: counts?.present ?? 0,
      permitCount: counts?.permit ?? 0,
    };
  });

  const pastClasses: StudentClassSummary[] = [...countMap.entries()]
    .filter(([classId]) => !activeIds.has(classId))
    .map(([classId, counts]) => ({
      classId,
      name: counts.fallbackName,
      active: false,
      presentCount: counts.present,
      permitCount: counts.permit,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const loading = enrolled.loading || attendances.loading || permits.loading;
  const offline = attendances.offline || permits.offline;
  const error = enrolled.error ?? attendances.error ?? permits.error;

  function openClassRecap(item: StudentClassSummary) {
    router.push({
      pathname: '/praktikan/kelas-detail',
      params: { classId: item.classId, className: item.name },
    });
  }

  return (
    <Page tabScreen backdrop="topo">
      <Feedback loading={loading} offline={offline} error={error} retry={retry} />

      {!loading && !error && activeClasses.length === 0 && pastClasses.length === 0 ? (
        <Card title="Belum ada kelas praktikum">
          <Text style={styles.muted}>
            Kelas yang kamu ikuti akan muncul di sini setelah asisten menambahkan NIM kamu.
          </Text>
        </Card>
      ) : null}

      {activeClasses.length > 0 ? (
        <>
          <Text style={local.eyebrow}>KELAS AKTIF ({activeClasses.length})</Text>
          {activeClasses.map((item, idx) => (
            <Pressable
              key={item.classId}
              accessibilityRole="button"
              accessibilityLabel={`Buka rekap kelas ${item.name}`}
              onPress={() => openClassRecap(item)}
              style={({ pressed }) => [
                local.classCard,
                idx === 0 && local.classCardHighlight,
                pressed && styles.pressed,
              ]}
            >
              {idx === 0 ? <CornerDotAccent /> : null}
              <View style={local.classInfo}>
                <View style={local.classIndexBadge}>
                  <Text style={local.classIndex}>{String(idx + 1).padStart(2, '0')}</Text>
                </View>
                <Text style={styles.heading}>{item.name}</Text>
              </View>
              <View style={local.badgeRow}>
                <Text style={styles.badge}>{item.presentCount} Hadir</Text>
                <Text style={styles.badgeSoft}>{item.permitCount} Izin</Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}

      {pastClasses.length > 0 ? (
        <>
          <Text style={local.eyebrow}>KELAS TERDAHULU</Text>
          {pastClasses.map((item) => (
            <Pressable
              key={item.classId}
              accessibilityRole="button"
              accessibilityLabel={`Buka rekap kelas terdahulu ${item.name}`}
              onPress={() => openClassRecap(item)}
              style={({ pressed }) => [local.pastClassCard, pressed && styles.pressed]}
            >
              <View style={local.classInfo}>
                <Text style={styles.heading}>{item.name}</Text>
                <Text style={styles.muted}>
                  {item.presentCount} Hadir · {item.permitCount} Izin
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}
    </Page>
  );
}

type RecapEntry =
  | { kind: 'attendance'; sortMs: number; item: Attendance }
  | { kind: 'permit'; sortMs: number; item: Permit };

/** Halaman Detail Rekap Kehadiran Kelas Praktikan — hanya menampilkan kartu sesi dengan catatan Hadir atau Izin. */
export function StudentClassDetail() {
  const { classId, className } = useLocalSearchParams<{ classId?: string; className?: string }>();
  const { user, role } = useAuth();
  if (!user || role !== 'praktikan' || !classId) {
    return (
      <Page title="Rekap kelas" detail>
        <Card title="Kelas tidak ditemukan." />
      </Page>
    );
  }
  return (
    <StudentClassDetailContent
      key={`${user.uid}:${classId}`}
      uid={user.uid}
      classId={classId}
      fallbackName={className}
    />
  );
}

function StudentClassDetailContent({
  uid,
  classId,
  fallbackName,
}: {
  uid: string;
  classId: string;
  fallbackName?: string;
}) {
  const insets = useSafeAreaInsets();
  const [attempt, setAttempt] = useState(0);
  const filters = [{ field: 'studentUid', value: uid }];
  const attendances = useLive<Attendance[]>(
    uid,
    { kind: 'list', path: 'attendances', filters, order: 'checkedInAt', pageSize: 200 },
    attempt,
  );
  const permits = useLive<Permit[]>(
    uid,
    { kind: 'list', path: 'permits', filters, order: 'submittedAt', pageSize: 200 },
    attempt,
  );

  const classAttendances = (attendances.data ?? []).filter((item) => item.classId === classId);
  const classPermits = (permits.data ?? []).filter((item) => item.classId === classId);

  const reviewAccess = useReviewAccess(
    attendances.offline ? [] : classAttendances.map((item) => item.id),
    attempt,
  );

  const entries: RecapEntry[] = [
    ...classAttendances.map((item) => ({
      kind: 'attendance' as const,
      sortMs: item.checkedInAt.toMillis(),
      item,
    })),
    ...classPermits.map((item) => ({
      kind: 'permit' as const,
      sortMs: item.submittedAt.toMillis(),
      item,
    })),
  ].sort((a, b) => b.sortMs - a.sortMs);

  const title =
    fallbackName ??
    classAttendances[0]?.sessionSnapshot.className ??
    classPermits[0]?.sessionSnapshot.className ??
    'Rekap kelas';

  const loading = attendances.loading || permits.loading;
  const offline = attendances.offline || permits.offline;
  const error = attendances.error ?? permits.error;
  const retry = () => setAttempt((n) => n + 1);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScreenBackdrop variant="topo" />
      <ConcentricArcOverlay />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        <View style={[local.darkHeader, { paddingTop: insets.top + 12 }]}>
          <DarkGradientOverlay />
          <DarkContourOverlay />
          <View style={local.darkTopRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kembali ke kelas saya"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace('/praktikan/kelas')
              }
              style={({ pressed }) => [local.backCircle, pressed && styles.pressed]}
            >
              <Image
                source={ARROW_BACK_LIGHT}
                contentFit="contain"
                accessible={false}
                style={local.backIcon}
              />
            </Pressable>
            <View style={local.headerTag}>
              <Text style={local.headerTagText}>Rekap saya</Text>
            </View>
          </View>
          <View>
            <Text style={local.headerEyebrow}>KELAS PRAKTIKUM</Text>
            <Text accessibilityRole="header" style={local.headerTitle}>
              {title}
            </Text>
          </View>
        </View>

        <View style={local.detailBody}>
          <View style={local.summaryPill}>
            <View style={local.summaryCol}>
              <Text style={local.summaryValue}>{classAttendances.length}</Text>
              <Text style={local.summaryLabel}>Hadir</Text>
            </View>
            <View style={local.summaryDivider} />
            <View style={local.summaryCol}>
              <Text style={local.summaryValue}>{classPermits.length}</Text>
              <Text style={local.summaryLabel}>Izin</Text>
            </View>
          </View>

          <Feedback loading={loading} offline={offline} error={error} retry={retry} />
          {reviewAccess.error ? (
            <Feedback loading={false} offline={false} error={reviewAccess.error} retry={retry} />
          ) : null}

          {!loading && !error && entries.length === 0 ? (
            <Card title="Belum ada catatan kehadiran atau izin">
              <Text style={styles.muted}>
                Hanya sesi yang memiliki catatan hadir atau izin pada kelas ini yang akan muncul di
                sini.
              </Text>
            </Card>
          ) : null}

          {entries.map((entry) =>
            entry.kind === 'attendance' ? (
              <Card key={`att-${entry.item.id}`}>
                <View style={local.cardTopRow}>
                  <Text style={[styles.heading, local.flexTitle]}>
                    {entry.item.sessionSnapshot.moduleTitle}
                  </Text>
                  <Text style={styles.badge}>✓ Hadir</Text>
                </View>
                <Text style={styles.muted}>
                  Tercatat{' '}
                  {formatDateTime(
                    entry.item.checkedInAt.toDate(),
                    entry.item.sessionSnapshot.timeZone,
                  )}
                </Text>
                {reviewAccess.access?.[entry.item.id]?.state === 'submitted' ||
                reviewAccess.access?.[entry.item.id]?.state === 'ready' ? (
                  <AuthButton
                    title={
                      reviewAccess.access[entry.item.id].state === 'submitted'
                        ? 'Lihat ulasan'
                        : 'Tulis ulasan'
                    }
                    variant={
                      reviewAccess.access[entry.item.id].state === 'submitted'
                        ? 'outline'
                        : 'primary'
                    }
                    onPress={() =>
                      router.push({
                        pathname: '/praktikan/ulasan',
                        params: {
                          classId: entry.item.classId,
                          sessionId: entry.item.sessionId,
                        },
                      })
                    }
                  />
                ) : null}
              </Card>
            ) : (
              <Card key={`per-${entry.item.id}`}>
                <View style={local.cardTopRow}>
                  <Text style={[styles.heading, local.flexTitle]}>
                    {entry.item.sessionSnapshot.moduleTitle}
                  </Text>
                  <Text
                    style={
                      entry.item.status === 'rejected' ? styles.badgeDanger : styles.badgeSoft
                    }
                  >
                    Izin · {permitStatuses[entry.item.status]}
                  </Text>
                </View>
                <View style={local.reasonBox}>
                  <Text style={styles.text}>{entry.item.reason}</Text>
                </View>
                {entry.item.decisionNote ? (
                  <Text style={styles.muted}>Catatan asisten · {entry.item.decisionNote}</Text>
                ) : null}
              </Card>
            ),
          )}

          {entries.length > 0 ? (
            <Text style={local.footnote}>
              Hanya sesi dengan catatan hadir atau izin yang ditampilkan.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  cleanStack: {
    gap: 14,
  },
  sessionHeadBlock: {
    gap: 4,
  },
  sessionEyebrow: {
    color: BrandColors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  sessionHeading: {
    color: BrandColors.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  infoBox: {
    backgroundColor: BrandColors.pageBackground,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 14,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  infoText: {
    color: BrandColors.ink,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    flex: 1,
  },
  statusBox: {
    backgroundColor: BrandColors.pageBackground,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 14,
    gap: 8,
  },
  actionStack: {
    gap: 10,
    marginTop: 4,
  },
  reviewQuoteBox: {
    backgroundColor: BrandColors.pageBackground,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 15,
    gap: 8,
  },
  footnote: {
    color: BrandColors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingVertical: 6,
  },
  eyebrow: {
    color: BrandColors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: 4,
  },
  classCard: {
    backgroundColor: BrandColors.paper,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  classCardHighlight: {
    borderWidth: 1.5,
    borderColor: BrandColors.ink,
  },
  pastClassCard: {
    backgroundColor: BrandColors.soft,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 15,
    gap: 4,
  },
  classInfo: {
    gap: 5,
  },
  classIndexBadge: {
    alignSelf: 'flex-start',
    backgroundColor: BrandColors.pageBackground,
    borderWidth: 1,
    borderColor: BrandColors.line,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  classIndex: {
    color: BrandColors.ink,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  darkHeader: {
    backgroundColor: BrandColors.ink,
    paddingHorizontal: 18,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: 14,
    overflow: 'hidden',
  },
  darkTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 17,
    height: 17,
  },
  headerTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  headerTagText: {
    color: BrandColors.paper,
    fontSize: 11,
    fontWeight: '800',
  },
  headerEyebrow: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  headerTitle: {
    color: BrandColors.paper,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  detailBody: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 16,
    marginTop: -18,
    gap: 12,
  },
  summaryPill: {
    backgroundColor: BrandColors.paper,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BrandColors.line,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  summaryCol: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    color: BrandColors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  summaryLabel: {
    color: BrandColors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: BrandColors.line,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  flexTitle: {
    flex: 1,
  },
  reasonBox: {
    backgroundColor: BrandColors.pageBackground,
    borderRadius: 14,
    padding: 12,
  },
});
