import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton, AuthError } from '@/components/auth-screen';
import { BrandColors, SessionStatusColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { parseSession } from '@/lib/schedule';
import type { Session } from '@/types/session';

const SESSION_STATUS = {
  upcoming: SessionStatusColors.BELUM_DIBUKA,
  open: SessionStatusColors.DIBUKA,
  closed: SessionStatusColors.DITUTUP,
} as const;

function getFirestoreErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code.includes('permission-denied')) {
    return 'Akses presensi ditolak oleh aturan keamanan Firestore. Hubungi pengelola aplikasi.';
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'Koneksi ke server terputus. Periksa jaringan internet lalu coba lagi.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Terjadi kesalahan saat memuat atau menyimpan presensi.';
}

export default function PraktikanPresensiScreen() {
  const insets = useSafeAreaInsets();
  const { sessionId: rawSessionId } = useLocalSearchParams<{
    sessionId?: string | string[];
  }>();
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
  const { user, profile, role } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [hasAttendance, setHasAttendance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    let active = true;
    let stopSession = () => {};
    let stopAttendance = () => {};

    if (!sessionId || !user?.uid || role !== 'praktikan') {
      // Clear stale session data when route or auth context is invalid.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      setSession(null);
      setHasAttendance(false);
      setError(
        !sessionId
          ? 'ID sesi tidak ditemukan. Kembali ke jadwal dan pilih sesi.'
          : 'Halaman ini hanya dapat digunakan oleh akun praktikan.',
      );
      return () => {
        active = false;
      };
    }

    const activeSessionId = sessionId;
    const activeUserId = user.uid;
    setLoading(true);
    setError(null);
    setSession(null);
    setHasAttendance(false);

    async function subscribe() {
      try {
        const [firebase, firestore] = await Promise.all([
          import('@/lib/firebase'),
          import('@react-native-firebase/firestore'),
        ]);
        if (!active) return;

        stopSession = firestore.onSnapshot(
          firestore.doc(firebase.db, 'sessions', activeSessionId),
          (snapshot) => {
            if (!active) return;
            try {
              if (!snapshot.exists()) {
                setSession(null);
                setError('Sesi praktikum tidak ditemukan.');
                setLoading(false);
                return;
              }
              setSession(parseSession(snapshot.id, snapshot.data()));
              setError(null);
              setLoading(false);
            } catch (snapshotError) {
              setError(getFirestoreErrorMessage(snapshotError));
              setLoading(false);
            }
          },
          (snapshotError) => {
            if (!active) return;
            setError(getFirestoreErrorMessage(snapshotError));
            setLoading(false);
          },
        );

        stopAttendance = firestore.onSnapshot(
          firestore.query(
            firestore.collection(firebase.db, 'attendances'),
            firestore.where('sessionId', '==', activeSessionId),
            firestore.where('studentId', '==', activeUserId),
          ),
          (snapshot) => {
            if (!active) return;
            setHasAttendance(!snapshot.empty);
          },
          (snapshotError) => {
            if (!active) return;
            setError(getFirestoreErrorMessage(snapshotError));
            setLoading(false);
          },
        );
      } catch (subscribeError) {
        if (!active) return;
        setError(getFirestoreErrorMessage(subscribeError));
        setLoading(false);
      }
    }

    void subscribe();
    return () => {
      active = false;
      stopSession();
      stopAttendance();
    };
  }, [sessionId, user?.uid, role, attempt]);

  async function checkIn() {
    if (
      !session ||
      session.status !== 'open' ||
      hasAttendance ||
      !user?.uid ||
      profile?.role !== 'praktikan' ||
      submitLock.current
    ) {
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const [firebase, firestore] = await Promise.all([
        import('@/lib/firebase'),
        import('@react-native-firebase/firestore'),
      ]);
      const attendanceQuery = firestore.query(
        firestore.collection(firebase.db, 'attendances'),
        firestore.where('sessionId', '==', session.id),
        firestore.where('studentId', '==', user.uid),
      );
      const existing = await firestore.getDocs(attendanceQuery);
      if (!existing.empty) {
        setHasAttendance(true);
        setError('Anda sudah melakukan presensi untuk sesi ini.');
        return;
      }

      const attendanceRef = firestore.doc(
        firebase.db,
        'attendances',
        `${session.id}_${user.uid}`,
      );
      const created = await firestore.runTransaction(firebase.db, async (transaction) => {
        const existingAttendance = await transaction.get(attendanceRef);
        if (existingAttendance.exists()) return false;
        transaction.set(attendanceRef, {
          sessionId: session.id,
          studentId: user.uid,
          studentName: profile.name,
          nim: profile.nim,
          checkedInAt: firestore.serverTimestamp(),
        });
        return true;
      });
      if (!created) {
        setHasAttendance(true);
        setError('Anda sudah melakukan presensi untuk sesi ini.');
        return;
      }

      setHasAttendance(true);
      setFeedbackVisible(true);
    } catch (submitError) {
      setError(getFirestoreErrorMessage(submitError));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  function navigateTo(path: '/(app)/praktikan/ajukan-izin' | '/(app)/praktikan/ulasan') {
    if (!sessionId) return;
    router.push({ pathname: path, params: { sessionId } });
  }

  const status = session ? SESSION_STATUS[session.status] : null;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}>
        <Text accessibilityRole="header" style={styles.title}>
          Detail sesi{'\n'}praktikum.
        </Text>

        {!sessionId ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sesi tidak ditemukan</Text>
            <Text style={styles.description}>Kembali ke jadwal dan pilih sesi praktikum.</Text>
          </View>
        ) : loading ? (
          <View style={styles.card} accessibilityRole="progressbar" accessibilityLabel="Memuat sesi">
            <ActivityIndicator color={BrandColors.forest} />
            <Text style={styles.description}>Memuat detail sesi...</Text>
          </View>
        ) : session ? (
          <>
            <View style={styles.identityCard}>
              <Text style={styles.eyebrow}>PRAKTIKAN</Text>
              <Text style={styles.identityName}>{profile?.name ?? 'Praktikan'}</Text>
              {profile?.role === 'praktikan' && (
                <Text style={styles.description}>NIM {profile.nim}</Text>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.classBadge}>{session.className}</Text>
                {status && (
                  <Text style={[styles.statusBadge, { color: status.text, backgroundColor: status.bg }]}>
                    {status.label}
                  </Text>
                )}
              </View>
              <Text style={styles.cardTitle}>{session.practicum}</Text>
              <Text style={styles.description}>{session.module}</Text>
              <Text style={styles.detail}>Tanggal: {session.date}</Text>
              <Text style={styles.detail}>
                Waktu: {session.startTime}–{session.endTime} WIB
              </Text>
              <Text style={styles.detail}>Ruangan: {session.room}</Text>
            </View>

            {session.status !== 'open' && (
              <View style={styles.blockedState}>
                <Text style={styles.cardTitle}>
                  {session.status === 'upcoming'
                    ? 'Presensi belum dibuka'
                    : 'Sesi praktikum sudah ditutup'}
                </Text>
                <Text style={styles.description}>
                  {session.status === 'upcoming'
                    ? 'Tunggu sampai asisten membuka sesi untuk melakukan presensi.'
                    : 'Presensi tidak dapat dilakukan setelah sesi ditutup.'}
                </Text>
              </View>
            )}

            {hasAttendance ? (
              <>
                <AuthButton title="Sudah Presensi" onPress={() => {}} disabled />
                <View style={styles.successState}>
                  <Text style={styles.description}>Presensi Anda untuk sesi ini sudah tercatat.</Text>
                </View>
              </>
            ) : session.status === 'open' ? (
              <AuthButton title="Presensi Sekarang" onPress={checkIn} busy={submitting} />
            ) : null}

            {(session.status !== 'open' || !hasAttendance) && (
              <Pressable
                accessibilityRole="button"
                disabled={!sessionId}
                onPress={() => navigateTo('/(app)/praktikan/ajukan-izin')}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>Ajukan Izin</Text>
              </Pressable>
            )}

            {session.status === 'closed' && hasAttendance && (
              <Pressable
                accessibilityRole="button"
                onPress={() => navigateTo('/(app)/praktikan/ulasan')}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>Beri Ulasan</Text>
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Detail sesi belum tersedia</Text>
            <AuthButton title="Coba lagi" onPress={() => setAttempt((value) => value + 1)} />
          </View>
        )}

        <AuthError message={loading ? null : error} />
      </ScrollView>

      <Modal
        visible={feedbackVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Presensi berhasil</Text>
            <Text style={styles.description}>Kehadiran Anda telah tercatat untuk sesi ini.</Text>
            <AuthButton title="Mengerti" onPress={() => setFeedbackVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BrandColors.paper },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 24,
    gap: 18,
  },
  title: { color: BrandColors.forestDeep, fontSize: 34, lineHeight: 40, fontWeight: '800' },
  identityCard: {
    padding: 18,
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  eyebrow: { color: BrandColors.forestSoft, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  identityName: { color: BrandColors.forestDeep, fontSize: 20, fontWeight: '700' },
  card: {
    padding: 18,
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  cardHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  classBadge: {
    color: BrandColors.paper,
    backgroundColor: BrandColors.forest,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, fontSize: 12, fontWeight: '700' },
  cardTitle: { color: BrandColors.ink, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  description: { color: BrandColors.forestSoft, fontSize: 14, lineHeight: 21 },
  detail: { color: BrandColors.ink, fontSize: 14, lineHeight: 20 },
  blockedState: {
    padding: 16,
    gap: 6,
    borderLeftWidth: 4,
    borderColor: BrandColors.yellow,
    backgroundColor: SessionStatusColors.BELUM_DIBUKA.bg,
  },
  successState: {
    padding: 16,
    gap: 6,
    borderLeftWidth: 4,
    borderColor: BrandColors.forestSoft,
    backgroundColor: BrandColors.softGreen,
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: BrandColors.forest,
    borderRadius: 12,
    backgroundColor: BrandColors.paper,
  },
  secondaryButtonText: { color: BrandColors.forest, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: BrandColors.forestDeep,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 24,
    gap: 16,
    borderRadius: 18,
    backgroundColor: BrandColors.paper,
  },
});
