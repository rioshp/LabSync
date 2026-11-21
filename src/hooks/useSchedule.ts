import { useEffect, useState } from 'react';

import { getAuthErrorMessage } from '@/lib/auth';
import { subscribeSchedule } from '@/features/academic/listeners';
import type { Session } from '@/types/session';

import { useAuth } from './useAuth';

export function useSchedule() {
  const { user, role } = useAuth();
  const uid = user?.uid;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    uid, role, sessions: [] as Session[], loading: true, error: null as string | null, offline: false,
  });

  useEffect(() => {
    if (!uid || !role) return;
    return subscribeSchedule(uid, role, (schedule) => {
      setState({ uid, role, ...schedule, error: null });
    }, (error) => {
      const message = error && typeof error === 'object' && 'code' in error && error.code === 'firestore/permission-denied'
        ? 'Jadwal belum dapat diakses. Hubungi pengelola untuk memeriksa izin akses.'
        : getAuthErrorMessage(error);
      setState({ uid, role, sessions: [], loading: false, error: message, offline: false });
    });
  }, [uid, role, attempt]);

  function retry() {
    setState({ uid, role, sessions: [], loading: true, error: null, offline: false });
    setAttempt((previous) => previous + 1);
  }

  if (state.uid !== uid || state.role !== role) {
    return { sessions: [], loading: true, error: null, offline: false, retry };
  }
  return { sessions: state.sessions, loading: state.loading, error: state.error, offline: state.offline, retry };
}
