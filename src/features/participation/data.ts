import {
  collection,
  doc,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import type { AcademicSessionStatus } from '@/features/academic/types';

export type Session = {
  assistantUid: string;
  moduleTitle: string;
  room: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  status: AcademicSessionStatus;
};
export type ClassInfo = { name: string; practicumName: string; timeZone: string };
type Snapshot = {
  className: string;
  practicumName: string;
  moduleTitle: string;
  startsAt: Timestamp;
  timeZone: string;
};
export type Attendance = {
  id: string;
  sessionId: string;
  classId: string;
  studentUid: string;
  checkedInAt: Timestamp;
  sessionSnapshot: Snapshot;
};
export type Permit = {
  id: string;
  sessionId: string;
  classId: string;
  studentUid: string;
  studentNameSnapshot: string;
  nimSnapshot: string;
  reason: string;
  decisionNote: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Timestamp;
  sessionSnapshot: Snapshot;
};
export type Review = {
  id: string;
  analysisStatus: 'pending' | 'processing' | 'succeeded' | 'failed';
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  text: string;
};

export const permitStatuses = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };
export const sentiments = { positive: 'Positif', neutral: 'Netral', negative: 'Negatif' };

export function formatTime(value: Timestamp, timeZone: string) {
  return value
    .toDate()
    .toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone });
}

type Filter = { field: string; value: string };
type LiveState<T> = { data: T | null; loading: boolean; error: string | null; offline: boolean };
type Source = {
  path: string;
  kind: 'doc' | 'list';
  filters?: Filter[];
  order?: string;
  pageSize?: number;
};
const initial = { data: null, loading: true, error: null, offline: false };

/** Scope subscriptions to the signed-in account and wait for server confirmation before showing cached data. */
export function useLive<T>(scope: string, source: Source | null, attempt = 0): LiveState<T> {
  const encoded = source && JSON.stringify(source);
  const key = JSON.stringify([scope, encoded, attempt]);
  const [state, setState] = useState<{ key: string; value: LiveState<T> }>({
    key: '',
    value: initial,
  });

  useEffect(() => {
    if (!encoded) return;
    const spec: Source = JSON.parse(encoded);
    let active = true;
    let confirmed = false;
    let stop = () => {};
    function update(data: T | null, offline: boolean, error: string | null = null) {
      if (active) setState({ key, value: { data, offline, error, loading: false } });
    }
    function onError(error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      update(
        null,
        false,
        code.endsWith('permission-denied')
          ? 'Kamu tidak memiliki akses ke data ini.'
          : 'Data gagal dimuat. Periksa koneksi dan coba lagi.',
      );
    }

    void import('@/lib/firebase')
      .then(({ db }) => {
        if (!active) return;
        const meta = { includeMetadataChanges: true };
        if (spec.kind === 'doc') {
          stop = onSnapshot(
            doc(db, spec.path),
            meta,
            (snapshot) => {
              confirmed ||= !snapshot.metadata.fromCache;
              if (!confirmed) return;
              const data = snapshot.data();
              update(
                data ? ({ ...data, id: snapshot.id } as T) : null,
                snapshot.metadata.fromCache,
              );
            },
            onError,
          );
          return;
        }
        const filters = (spec.filters ?? []).map(({ field, value }) =>
          where(field === '__name__' ? documentId() : field, '==', value),
        );
        const options = [
          ...filters,
          ...(spec.order ? [orderBy(spec.order, 'desc')] : []),
          ...(spec.pageSize ? [limit(spec.pageSize)] : []),
        ];
        stop = onSnapshot(
          query(collection(db, spec.path), ...options),
          meta,
          (snapshot) => {
            confirmed ||= !snapshot.metadata.fromCache;
            if (!confirmed) return;
            update(
              snapshot.docs.map((item) => ({ ...item.data(), id: item.id })) as T,
              snapshot.metadata.fromCache,
            );
          },
          onError,
        );
      })
      .catch(onError);

    const timer = setTimeout(() => {
      if (!confirmed) update(null, true, 'Koneksi diperlukan untuk memuat data akun ini.');
    }, 10_000);
    return () => {
      active = false;
      clearTimeout(timer);
      stop();
    };
  }, [encoded, key]);

  return !source ? { ...initial, loading: false } : state.key === key ? state.value : initial;
}
