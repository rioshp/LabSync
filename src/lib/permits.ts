import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';

import type { Permit, PermitStatus } from '@/types/permit';

type SessionFallback = {
  className?: string;
  practicum?: string;
  module?: string;
  date?: string;
  assistantId?: string;
};

export function parsePermit(
  id: string,
  data: Record<string, unknown>,
  fallbackSession?: SessionFallback,
): Permit {
  const requiredFields = ['sessionId', 'studentId', 'studentName', 'nim', 'reason'] as const;
  for (const field of requiredFields) {
    if (typeof data[field] !== 'string' || !data[field].trim()) {
      throw new Error('Data pengajuan izin belum lengkap atau tidak valid.');
    }
  }

  const status = data.status;
  if (status !== 'pending' && status !== 'approved' && status !== 'rejected') {
    throw new Error('Status pengajuan izin tidak valid.');
  }

  const rawInfo =
    data.sessionInfo && typeof data.sessionInfo === 'object'
      ? (data.sessionInfo as Record<string, unknown>)
      : {};

  const practicum =
    typeof rawInfo.practicum === 'string' && rawInfo.practicum.trim()
      ? rawInfo.practicum.trim()
      : fallbackSession?.practicum ?? '';
  const moduleName =
    typeof rawInfo.module === 'string' && rawInfo.module.trim()
      ? rawInfo.module.trim()
      : fallbackSession?.module ?? '';
  const className =
    typeof rawInfo.className === 'string' && rawInfo.className.trim()
      ? rawInfo.className.trim()
      : fallbackSession?.className ?? 'Kelas Praktikum';
  const date =
    typeof rawInfo.date === 'string' && rawInfo.date.trim()
      ? rawInfo.date.trim()
      : fallbackSession?.date ?? '-';

  if (!practicum || !moduleName) {
    throw new Error('Informasi sesi pada pengajuan izin tidak lengkap.');
  }

  if (data.submittedAt != null && !(data.submittedAt instanceof Timestamp)) {
    throw new Error('Format waktu pengajuan izin tidak valid.');
  }

  return {
    id,
    sessionId: String(data.sessionId).trim(),
    assistantId:
      typeof data.assistantId === 'string' && data.assistantId.trim()
        ? data.assistantId.trim()
        : fallbackSession?.assistantId,
    sessionInfo: {
      practicum,
      module: moduleName,
      className,
      date,
    },
    studentId: String(data.studentId).trim(),
    studentName: String(data.studentName).trim(),
    nim: String(data.nim).trim(),
    reason: String(data.reason).trim(),
    status,
    reviewedBy:
      typeof data.reviewedBy === 'string' && data.reviewedBy.trim()
        ? data.reviewedBy.trim()
        : null,
    reviewNote:
      typeof data.reviewNote === 'string' && data.reviewNote.trim()
        ? data.reviewNote.trim()
        : null,
    submittedAt: (data.submittedAt as Timestamp | null | undefined) ?? null,
  };
}

export function getPermitErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code.includes('permission-denied')) {
    return 'Akses data izin ditolak oleh aturan keamanan Firestore.';
  }
  if (code.includes('unavailable') || code.includes('network-request-failed')) {
    return 'Koneksi ke server terputus. Periksa jaringan internet Anda lalu coba lagi.';
  }
  if (code.includes('not-found')) {
    return 'Dokumen pengajuan izin tidak ditemukan.';
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Terjadi kesalahan saat memproses data izin. Silakan coba lagi.';
}

function getSubmittedTimeMs(permit: Permit): number {
  const ts = permit.submittedAt as unknown as { toMillis?: () => number; seconds?: number } | null;
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

export function sortPermits(permits: Permit[]): Permit[] {
  return [...permits].sort((a, b) => {
    const diff = getSubmittedTimeMs(b) - getSubmittedTimeMs(a);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

type PermitsState = {
  permits: Permit[];
  loading: boolean;
};

export function subscribeAssistantPermits(
  assistantUid: string,
  onChange: (state: PermitsState) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  let generation = 0;
  let stopSessions = () => {};
  let stopPermits: (() => void)[] = [];

  function clearPermitListeners() {
    generation += 1;
    stopPermits.forEach((stop) => stop());
    stopPermits = [];
  }

  function stop() {
    if (!active) return;
    active = false;
    stopSessions();
    clearPermitListeners();
  }

  function fail(error: unknown) {
    if (!active) return;
    stop();
    onError(error);
  }

  async function start() {
    try {
      const { db } = await import('./firebase');
      if (!active) return;

      let previousSessionKey: string | null = null;
      stopSessions = onSnapshot(
        query(collection(db, 'sessions'), where('assistantId', '==', assistantUid)),
        (sessionSnap) => {
          if (!active) return;
          const sessionMap = new Map<string, SessionFallback>();
          for (const item of sessionSnap.docs) {
            const raw = item.data();
            sessionMap.set(item.id, {
              className: typeof raw.className === 'string' ? raw.className : undefined,
              practicum: typeof raw.practicum === 'string' ? raw.practicum : undefined,
              module: typeof raw.module === 'string' ? raw.module : undefined,
              date: typeof raw.date === 'string' ? raw.date : undefined,
              assistantId: typeof raw.assistantId === 'string' ? raw.assistantId : assistantUid,
            });
          }

          const sessionIds = [...sessionMap.keys()].sort();
          const key = JSON.stringify(sessionIds);
          if (key === previousSessionKey) return;
          previousSessionKey = key;

          clearPermitListeners();
          const current = generation;
          if (sessionIds.length === 0) {
            onChange({ permits: [], loading: false });
            return;
          }

          const results = new Map<number, Permit[]>();
          onChange({ permits: [], loading: true });

          sessionIds.forEach((sessionId, index) => {
            const fallback = sessionMap.get(sessionId);
            const unsubscribe = onSnapshot(
              query(collection(db, 'permits'), where('sessionId', '==', sessionId)),
              (permitSnap) => {
                if (!active || current !== generation) return;
                try {
                  results.set(
                    index,
                    permitSnap.docs.map((docSnap) =>
                      parsePermit(docSnap.id, docSnap.data(), fallback),
                    ),
                  );
                  if (results.size !== sessionIds.length) return;
                  onChange({
                    permits: sortPermits([...results.values()].flat()),
                    loading: false,
                  });
                } catch (err) {
                  fail(err);
                }
              },
              (err) => {
                if (current === generation) fail(err);
              },
            );
            stopPermits.push(unsubscribe);
          });
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
  }

  onChange({ permits: [], loading: true });
  void start();
  return stop;
}

export async function reviewPermit(
  permitId: string,
  input: {
    status: Exclude<PermitStatus, 'pending'>;
    reviewedBy: string;
    reviewNote?: string | null;
  },
): Promise<void> {
  const cleanPermitId = permitId.trim();
  const cleanReviewer = input.reviewedBy.trim();
  const cleanNote = (input.reviewNote ?? '').trim();

  if (!cleanPermitId) {
    throw new Error('ID pengajuan izin tidak valid.');
  }
  if (!cleanReviewer) {
    throw new Error('Identitas asisten tidak ditemukan.');
  }
  if (input.status !== 'approved' && input.status !== 'rejected') {
    throw new Error('Status verifikasi izin tidak valid.');
  }
  if (input.status === 'rejected' && cleanNote.length === 0) {
    throw new Error('Catatan penolakan wajib diisi.');
  }

  try {
    const { db } = await import('./firebase');
    await updateDoc(doc(db, 'permits', cleanPermitId), {
      status: input.status,
      reviewedBy: cleanReviewer,
      reviewNote: cleanNote.length > 0 ? cleanNote : null,
    });
  } catch (error) {
    throw new Error(getPermitErrorMessage(error));
  }
}
