import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from '@react-native-firebase/firestore';

import { getPermitErrorMessage, parsePermit, sortPermits } from './permits';
import type { Attendance } from '@/types/attendance';
import type { Permit } from '@/types/permit';

type SessionLookup = {
  className?: string;
  practicum?: string;
  module?: string;
  date?: string;
};

export function parseAttendance(
  id: string,
  data: Record<string, unknown>,
  fallbackSession?: SessionLookup,
): Attendance {
  const requiredFields = ['sessionId', 'studentId', 'studentName', 'nim'] as const;
  for (const field of requiredFields) {
    if (typeof data[field] !== 'string' || !data[field].trim()) {
      throw new Error('Data riwayat kehadiran belum lengkap atau tidak valid.');
    }
  }

  if (data.checkedInAt != null && !(data.checkedInAt instanceof Timestamp)) {
    throw new Error('Format waktu kehadiran tidak valid.');
  }

  const rawInfo =
    data.sessionInfo && typeof data.sessionInfo === 'object'
      ? (data.sessionInfo as Record<string, unknown>)
      : {};

  const practicum =
    firstNonEmptyString(rawInfo.practicum, data.practicum, fallbackSession?.practicum) ??
    'Praktikum';
  const moduleName =
    firstNonEmptyString(rawInfo.module, data.module, fallbackSession?.module) ??
    `Sesi ${String(data.sessionId).trim()}`;
  const className =
    firstNonEmptyString(rawInfo.className, data.className, fallbackSession?.className) ??
    'Kelas Praktikum';

  return {
    id,
    sessionId: String(data.sessionId).trim(),
    sessionInfo: {
      practicum,
      module: moduleName,
      className,
    },
    studentId: String(data.studentId).trim(),
    studentName: String(data.studentName).trim(),
    nim: String(data.nim).trim(),
    checkedInAt: (data.checkedInAt as Timestamp | null | undefined) ?? null,
  };
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getTimestampMs(value: Timestamp | null): number {
  const ts = value as unknown as { toMillis?: () => number; seconds?: number } | null;
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

export function sortAttendances(attendances: Attendance[]): Attendance[] {
  return [...attendances].sort((a, b) => {
    const diff = getTimestampMs(b.checkedInAt) - getTimestampMs(a.checkedInAt);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

export function formatCheckInTime(checkedInAt: Timestamp | null): string {
  const ms = getTimestampMs(checkedInAt);
  if (!ms) return ' baru saja';
  const date = new Date(ms);
  const formattedDate = date.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${formattedDate} · ${formattedTime} WIB`;
}

export function getHistoryErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code.includes('permission-denied')) {
    return 'Akses data riwayat ditolak oleh aturan keamanan Firestore.';
  }
  return getPermitErrorMessage(error);
}

export type StudentHistoryState = {
  attendances: Attendance[];
  permits: Permit[];
  loading: boolean;
};

export function subscribeStudentHistory(
  studentUid: string,
  onChange: (state: StudentHistoryState) => void,
  onError: (error: unknown) => void,
  sessionMap: ReadonlyMap<string, SessionLookup> = new Map(),
): () => void {
  let active = true;
  let stopAttendances = () => {};
  let stopPermits = () => {};

  function stop() {
    if (!active) return;
    active = false;
    stopAttendances();
    stopPermits();
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

      let attendancesReady = false;
      let permitsReady = false;
      let latestAttendances: Attendance[] = [];
      let latestPermits: Permit[] = [];

      function publishIfReady() {
        if (!active || !attendancesReady || !permitsReady) return;
        onChange({
          attendances: latestAttendances,
          permits: latestPermits,
          loading: false,
        });
      }

      stopAttendances = onSnapshot(
        query(collection(db, 'attendances'), where('studentId', '==', studentUid)),
        (snapshot) => {
          if (!active) return;
          try {
            latestAttendances = sortAttendances(
              snapshot.docs.map((item) =>
                parseAttendance(
                  item.id,
                  item.data(),
                  sessionMap.get(String(item.data().sessionId ?? '').trim()),
                ),
              ),
            );
            attendancesReady = true;
            publishIfReady();
          } catch (err) {
            fail(err);
          }
        },
        fail,
      );

      stopPermits = onSnapshot(
        query(collection(db, 'permits'), where('studentId', '==', studentUid)),
        (snapshot) => {
          if (!active) return;
          try {
            latestPermits = sortPermits(
              snapshot.docs.map((item) =>
                parsePermit(
                  item.id,
                  item.data(),
                  sessionMap.get(String(item.data().sessionId ?? '').trim()),
                ),
              ),
            );
            permitsReady = true;
            publishIfReady();
          } catch (err) {
            fail(err);
          }
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
  }

  onChange({ attendances: [], permits: [], loading: true });
  void start();
  return stop;
}
