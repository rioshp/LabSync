import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AuthButton, AuthError, AuthScreen } from '@/components/auth-screen';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { parseSession } from '@/lib/schedule';
import type { Session } from '@/types/session';

function getFirestoreErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code.includes('permission-denied')) {
    return 'Ulasan tidak dapat disimpan karena aturan keamanan Firestore menolak penulisan. Hubungi pengelola aplikasi.';
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'Koneksi ke server terputus. Periksa jaringan internet lalu coba lagi.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Terjadi kesalahan saat mengirim ulasan.';
}

export default function PraktikanUlasanScreen() {
  const { sessionId: rawSessionId } = useLocalSearchParams<{
    sessionId?: string | string[];
  }>();
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
  const { user, profile, role } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [checkingDuplicate, setCheckingDuplicate] = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    let active = true;
    let stopSession = () => {};

    if (!sessionId || !user?.uid || role !== 'praktikan') {
      // Avoid subscribing when the route or account is not valid.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingSession(false);
      setSession(null);
      setSessionError(
        !sessionId
          ? 'ID sesi tidak ditemukan. Kembali ke jadwal dan pilih sesi.'
          : 'Halaman ini hanya dapat digunakan oleh akun praktikan.',
      );
      return () => {
        active = false;
      };
    }

    const activeSessionId = sessionId;
    setLoadingSession(true);
    setSession(null);
    setSessionError(null);

    async function subscribeSession() {
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
            if (!snapshot.exists()) {
              setSession(null);
              setSessionError('Sesi praktikum tidak ditemukan.');
              setLoadingSession(false);
              return;
            }
            try {
              setSession(parseSession(snapshot.id, snapshot.data()));
              setSessionError(null);
            } catch (snapshotError) {
              setSession(null);
              setSessionError(getFirestoreErrorMessage(snapshotError));
            }
            setLoadingSession(false);
          },
          (snapshotError) => {
            if (!active) return;
            setSessionError(getFirestoreErrorMessage(snapshotError));
            setLoadingSession(false);
          },
        );
      } catch (subscribeError) {
        if (!active) return;
        setSessionError(getFirestoreErrorMessage(subscribeError));
        setLoadingSession(false);
      }
    }

    void subscribeSession();
    return () => {
      active = false;
      stopSession();
    };
  }, [sessionId, user?.uid, role, sessionAttempt]);

  useEffect(() => {
    let active = true;

    if (!sessionId || !user?.uid || role !== 'praktikan') {
      // Show route or auth validation without starting a Firestore query.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCheckingDuplicate(false);
      setAlreadyReviewed(false);
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
    setCheckingDuplicate(true);
    setAlreadyReviewed(false);
    setError(null);
    async function checkExistingReview() {
      try {
        const [firebase, firestore] = await Promise.all([
          import('@/lib/firebase'),
          import('@react-native-firebase/firestore'),
        ]);
        if (!active) return;
        const duplicateQuery = firestore.query(
          firestore.collection(firebase.db, 'reviews'),
          firestore.where('sessionId', '==', activeSessionId),
          firestore.where('studentId', '==', activeUserId),
        );
        const existing = await firestore.getDocs(duplicateQuery);
        if (active) setAlreadyReviewed(!existing.empty);
      } catch (checkError) {
        if (active) setError(getFirestoreErrorMessage(checkError));
      } finally {
        if (active) setCheckingDuplicate(false);
      }
    }

    void checkExistingReview();
    return () => {
      active = false;
    };
  }, [sessionId, user?.uid, role]);

  async function submitReview() {
    if (!sessionId) {
      setError('ID sesi tidak ditemukan. Kembali ke jadwal dan pilih sesi.');
      return;
    }
    if (!session) {
      setError('Detail sesi belum tersedia. Muat ulang data sesi lalu coba lagi.');
      return;
    }
    if (session.status !== 'closed') {
      setError('Ulasan hanya dapat dikirim setelah sesi ditutup.');
      return;
    }
    if (rating === null) {
      setError('Pilih rating bintang 1 sampai 5 terlebih dahulu.');
      return;
    }
    if (alreadyReviewed) {
      setError('Anda sudah memberikan ulasan untuk sesi ini.');
      return;
    }
    if (checkingDuplicate) {
      setError('Tunggu sampai pemeriksaan ulasan selesai.');
      return;
    }
    if (submitLock.current) return;
    if (!user?.uid || profile?.role !== 'praktikan' || role !== 'praktikan') {
      setError('Profil praktikan tidak tersedia. Keluar lalu masuk kembali.');
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
      const duplicateQuery = firestore.query(
        firestore.collection(firebase.db, 'reviews'),
        firestore.where('sessionId', '==', sessionId),
        firestore.where('studentId', '==', user.uid),
      );
      const existing = await firestore.getDocs(duplicateQuery);
      if (!existing.empty) {
        setAlreadyReviewed(true);
        setError('Anda sudah memberikan ulasan untuk sesi ini.');
        return;
      }

      const reviewRef = firestore.doc(
        firebase.db,
        'reviews',
        `${sessionId}_${user.uid}`,
      );
      const created = await firestore.runTransaction(firebase.db, async (transaction) => {
        const existingReview = await transaction.get(reviewRef);
        if (existingReview.exists()) return false;
        transaction.set(reviewRef, {
          sessionId,
          studentId: user.uid,
          studentName: profile.name,
          rating,
          comment: comment.trim(),
          createdAt: firestore.serverTimestamp(),
        });
        return true;
      });
      if (!created) {
        setAlreadyReviewed(true);
        setError('Anda sudah memberikan ulasan untuk sesi ini.');
        return;
      }
      setAlreadyReviewed(true);
      setSuccessVisible(true);
    } catch (submitError) {
      setError(getFirestoreErrorMessage(submitError));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  function closeSuccess() {
    setSuccessVisible(false);
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/jadwal');
  }

  return (
    <AuthScreen
      title="Beri ulasan."
      description="Bagikan penilaian Anda mengenai sesi praktikum.">
      {loadingSession ? (
        <View style={styles.infoCard} accessibilityRole="progressbar" accessibilityLabel="Memuat sesi">
          <ActivityIndicator color={BrandColors.forest} />
          <Text style={styles.description}>Memuat detail sesi...</Text>
        </View>
      ) : session ? (
        <View style={styles.infoCard}>
          <Text style={styles.eyebrow}>SESI PRAKTIKUM</Text>
          <Text style={styles.modalTitle}>{session.practicum} · {session.module}</Text>
          <Text style={styles.description}>{session.className} · {session.date}</Text>
        </View>
      ) : (
        <View style={styles.infoCard}>
          <Text style={styles.modalTitle}>Sesi praktikum belum tersedia</Text>
          <AuthError message={sessionError} />
          <AuthButton title="Coba lagi" onPress={() => setSessionAttempt((value) => value + 1)} />
        </View>
      )}
      {checkingDuplicate && (
        <View style={styles.infoCard} accessibilityRole="progressbar" accessibilityLabel="Memeriksa ulasan">
          <ActivityIndicator color={BrandColors.forest} />
          <Text style={styles.description}>Memeriksa ulasan sesi ini...</Text>
        </View>
      )}
      {alreadyReviewed && (
        <View style={styles.infoCard}>
          <Text style={styles.modalTitle}>Anda sudah memberi ulasan</Text>
          <Text style={styles.description}>Satu ulasan diizinkan untuk setiap sesi.</Text>
        </View>
      )}
      <View style={styles.form}>
        <Text style={styles.label}>Rating sesi</Text>
        <View style={styles.ratingRow} accessibilityRole="radiogroup">
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={`${value} dari 5 bintang`}
              accessibilityState={{ selected: rating === value }}
              disabled={
                submitting ||
                checkingDuplicate ||
                alreadyReviewed ||
                loadingSession ||
                session?.status !== 'closed'
              }
              onPress={() => {
                setRating(value);
                setError(null);
              }}
              style={({ pressed }) => [
                styles.starButton,
                rating !== null && value <= rating && styles.starButtonSelected,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.star,
                  rating !== null && value <= rating && styles.starSelected,
                ]}>
                ★
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.helperText}>
          {rating === null ? 'Pilih 1–5 bintang' : `${rating} dari 5 bintang`}
        </Text>

        <Text style={styles.label}>Komentar (opsional)</Text>
        <TextInput
          accessibilityLabel="Komentar ulasan"
          value={comment}
          onChangeText={setComment}
          placeholder="Ceritakan pengalaman Anda..."
          placeholderTextColor={BrandColors.muted}
          multiline
          maxLength={1000}
          textAlignVertical="top"
          editable={!submitting && !alreadyReviewed}
          style={styles.input}
        />
        <Text style={styles.helperText}>{comment.length}/1000 karakter</Text>
        <AuthError
          message={
            error ??
            sessionError ??
            (alreadyReviewed ? 'Anda sudah memberikan ulasan untuk sesi ini.' : null)
          }
        />
        <AuthButton
          title={alreadyReviewed ? 'Sudah Memberi Ulasan' : 'Kirim Ulasan'}
          onPress={submitReview}
          busy={submitting}
          disabled={
            !session ||
            session.status !== 'closed' ||
            role !== 'praktikan' ||
            checkingDuplicate ||
            alreadyReviewed ||
            loadingSession
          }
        />
      </View>

      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSuccess}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.modalTitle}>Ulasan berhasil dikirim</Text>
            <Text style={styles.description}>Terima kasih atas masukan Anda.</Text>
            <AuthButton title="Mengerti" onPress={closeSuccess} />
          </View>
        </View>
      </Modal>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    padding: 16,
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  eyebrow: { color: BrandColors.forestSoft, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  form: { gap: 12 },
  label: { color: BrandColors.ink, fontSize: 15, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', gap: 10 },
  starButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  starButtonSelected: { borderColor: BrandColors.yellow, backgroundColor: BrandColors.softGreen },
  star: { color: BrandColors.muted, fontSize: 30, lineHeight: 36 },
  starSelected: { color: BrandColors.forest },
  helperText: { color: BrandColors.muted, fontSize: 12 },
  input: {
    minHeight: 130,
    padding: 14,
    borderWidth: 1.5,
    borderColor: BrandColors.line,
    borderRadius: 12,
    color: BrandColors.ink,
    backgroundColor: BrandColors.paper,
    fontSize: 15,
    lineHeight: 22,
  },
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
  modalTitle: { color: BrandColors.forestDeep, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  description: { color: BrandColors.forestSoft, fontSize: 14, lineHeight: 21 },
});
