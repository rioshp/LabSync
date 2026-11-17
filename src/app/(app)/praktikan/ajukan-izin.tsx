import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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

type PermitClassification = 'valid' | 'perlu_ditinjau' | 'tidak_valid';

type ClassificationResult = {
  classification: PermitClassification;
  note: string;
};

const CLASSIFICATION_LABEL: Record<PermitClassification, string> = {
  valid: 'Valid',
  perlu_ditinjau: 'Perlu Ditinjau',
  tidak_valid: 'Tidak Valid',
};

const MANUAL_REVIEW: ClassificationResult = {
  classification: 'perlu_ditinjau',
  note: 'Klasifikasi gagal, perlu tinjauan manual',
};

function getFirestoreErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code.includes('permission-denied')) {
    return 'Pengajuan tidak dapat disimpan karena aturan keamanan Firestore menolak penulisan. Hubungi pengelola aplikasi.';
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'Koneksi ke server terputus. Periksa jaringan internet lalu coba lagi.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Terjadi kesalahan saat mengirim pengajuan izin.';
}

function parseClassification(value: unknown): ClassificationResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as { classification?: unknown; note?: unknown };
  if (
    result.classification !== 'valid' &&
    result.classification !== 'perlu_ditinjau' &&
    result.classification !== 'tidak_valid'
  ) {
    return null;
  }
  if (typeof result.note !== 'string' || !result.note.trim()) return null;
  return { classification: result.classification, note: result.note.trim() };
}

async function classifyPermitReasonSafely(reason: string): Promise<ClassificationResult> {
  try {
    const ai = await import('@/lib/ai');
    if (!('classifyPermitReason' in ai) || typeof ai.classifyPermitReason !== 'function') {
      return MANUAL_REVIEW;
    }
    const result = parseClassification(await ai.classifyPermitReason(reason));
    return result ?? MANUAL_REVIEW;
  } catch {
    return MANUAL_REVIEW;
  }
}

export default function PraktikanAjukanIzinScreen() {
  const { sessionId: rawSessionId } = useLocalSearchParams<{
    sessionId?: string | string[];
  }>();
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
  const { user, profile, role } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingDuplicate, setCheckingDuplicate] = useState(true);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [success, setSuccess] = useState<ClassificationResult | null>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    let active = true;
    let stopSession = () => {};

    if (!sessionId || !user?.uid || role !== 'praktikan') {
      // Clear stale session data when route or auth context is invalid.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      setCheckingDuplicate(false);
      setAlreadySubmitted(false);
      setSession(null);
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
    setCheckingDuplicate(true);
    setAlreadySubmitted(false);
    setError(null);
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

        const duplicateQuery = firestore.query(
          firestore.collection(firebase.db, 'permits'),
          firestore.where('sessionId', '==', activeSessionId),
          firestore.where('studentId', '==', activeUserId),
        );
        const existing = await firestore.getDocs(duplicateQuery);
        if (active) {
          setAlreadySubmitted(!existing.empty);
          setCheckingDuplicate(false);
        }
      } catch (subscribeError) {
        if (!active) return;
        setError(getFirestoreErrorMessage(subscribeError));
        setLoading(false);
        setCheckingDuplicate(false);
      }
    }
    void subscribe();

    return () => {
      active = false;
      stopSession();
    };
  }, [sessionId, user?.uid, role, attempt]);

  async function submitPermit() {
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError('Alasan ketidakhadiran wajib diisi.');
      return;
    }
    if (cleanReason.length < 20) {
      setError('Alasan ketidakhadiran minimal 20 karakter.');
      return;
    }
    if (
      !session ||
      !sessionId ||
      !user?.uid ||
      profile?.role !== 'praktikan' ||
      alreadySubmitted ||
      checkingDuplicate ||
      submitLock.current
    ) {
      setError('Data sesi atau profil praktikan belum tersedia.');
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
        firestore.collection(firebase.db, 'permits'),
        firestore.where('sessionId', '==', session.id),
        firestore.where('studentId', '==', user.uid),
      );
      const existing = await firestore.getDocs(duplicateQuery);
      if (!existing.empty) {
        setAlreadySubmitted(true);
        return;
      }

      const classification = await classifyPermitReasonSafely(cleanReason);
      const permitRef = firestore.doc(
        firebase.db,
        'permits',
        `${session.id}_${user.uid}`,
      );
      const created = await firestore.runTransaction(firebase.db, async (transaction) => {
        const existingPermit = await transaction.get(permitRef);
        if (existingPermit.exists()) return false;
        transaction.set(permitRef, {
          sessionId: session.id,
          sessionInfo: {
            practicum: session.practicum,
            module: session.module,
            date: session.date,
          },
          assistantId: session.assistantId,
          studentId: user.uid,
          studentName: profile.name,
          nim: profile.nim,
          reason: cleanReason,
          aiClassification: classification.classification,
          aiNote: classification.note,
          status: 'pending',
          reviewedBy: null,
          reviewNote: null,
          submittedAt: firestore.serverTimestamp(),
        });
        return true;
      });
      if (!created) {
        setAlreadySubmitted(true);
        setError('Anda sudah mengajukan izin untuk sesi ini.');
        return;
      }
      setAlreadySubmitted(true);
      setSuccess(classification);
    } catch (submitError) {
      setError(getFirestoreErrorMessage(submitError));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  function closeSuccess() {
    setSuccess(null);
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/jadwal');
  }

  return (
    <AuthScreen
      title="Ajukan izin."
      description="Tuliskan alasan ketidakhadiran untuk sesi praktikum ini.">
      {loading ? (
        <View style={styles.infoCard} accessibilityRole="progressbar" accessibilityLabel="Memuat sesi">
          <ActivityIndicator color={BrandColors.forest} />
          <Text style={styles.description}>Memuat detail sesi...</Text>
        </View>
      ) : session ? (
        <View style={styles.infoCard}>
          <Text style={styles.eyebrow}>SESI PRAKTIKUM</Text>
          <Text style={styles.sessionTitle}>{session.practicum} · {session.module}</Text>
          <Text style={styles.description}>
            {session.className} · {session.date}
          </Text>
        </View>
      ) : (
        <View style={styles.infoCard}>
          <Text style={styles.sessionTitle}>Sesi praktikum belum tersedia</Text>
          <AuthButton title="Coba lagi" onPress={() => setAttempt((value) => value + 1)} />
        </View>
      )}
      {checkingDuplicate && !loading && (
        <View style={styles.infoCard} accessibilityRole="progressbar" accessibilityLabel="Memeriksa pengajuan">
          <ActivityIndicator color={BrandColors.forest} />
          <Text style={styles.description}>Memeriksa pengajuan izin sesi ini...</Text>
        </View>
      )}
      {alreadySubmitted && (
        <View style={styles.infoCard}>
          <Text style={styles.sessionTitle}>Anda sudah mengajukan izin</Text>
          <Text style={styles.description}>Satu pengajuan diizinkan untuk setiap sesi.</Text>
        </View>
      )}

      <View style={styles.form}>
        <Text style={styles.label}>Alasan ketidakhadiran</Text>
        <TextInput
          accessibilityLabel="Alasan ketidakhadiran"
          value={reason}
          onChangeText={(value) => {
            setReason(value);
            if (error) setError(null);
          }}
          placeholder="Jelaskan alasan izin Anda..."
          placeholderTextColor={BrandColors.muted}
          multiline
          maxLength={1000}
          textAlignVertical="top"
          editable={!submitting && !alreadySubmitted}
          style={styles.input}
        />
        <Text style={styles.helperText}>{reason.trim().length}/1000 karakter · minimal 20</Text>
        <AuthError
          message={
            error ??
            (alreadySubmitted ? 'Anda sudah mengajukan izin untuk sesi ini.' : null)
          }
        />
        <AuthButton
          title={alreadySubmitted ? 'Sudah Mengajukan Izin' : 'Kirim Pengajuan'}
          onPress={submitPermit}
          busy={submitting}
          disabled={loading || checkingDuplicate || alreadySubmitted || !session || role !== 'praktikan'}
        />
      </View>

      <Modal
        visible={success !== null}
        transparent
        animationType="fade"
        onRequestClose={closeSuccess}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.sessionTitle}>Pengajuan berhasil dikirim</Text>
            {success && (
              <>
                <Text style={styles.description}>
                  Izin Anda diklasifikasikan sebagai:{' '}
                  <Text style={styles.classification}>
                    {CLASSIFICATION_LABEL[success.classification]}
                  </Text>
                </Text>
                <Text style={styles.description}>{success.note}</Text>
              </>
            )}
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
  sessionTitle: { color: BrandColors.forestDeep, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  description: { color: BrandColors.forestSoft, fontSize: 14, lineHeight: 21 },
  form: { gap: 12 },
  label: { color: BrandColors.ink, fontSize: 15, fontWeight: '700' },
  input: {
    minHeight: 160,
    padding: 14,
    borderWidth: 1.5,
    borderColor: BrandColors.line,
    borderRadius: 12,
    color: BrandColors.ink,
    backgroundColor: BrandColors.paper,
    fontSize: 15,
    lineHeight: 22,
  },
  helperText: { color: BrandColors.muted, fontSize: 12 },
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
  classification: { color: BrandColors.forest, fontWeight: '800' },
});
