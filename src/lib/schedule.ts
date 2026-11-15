import { collection, onSnapshot, query, Timestamp, where, type Query } from '@react-native-firebase/firestore';

import type { Session } from '@/types/session';
import type { Role } from '@/types/user';

export function parseSession(id: string, data: Record<string, unknown>): Session {
  const fields = ['classId', 'className', 'practicum', 'module', 'room', 'date', 'startTime', 'endTime', 'assistantId'] as const;
  for (const field of fields) {
    if (typeof data[field] !== 'string' || !data[field].trim()) {
      throw new Error('Data jadwal belum lengkap. Hubungi asisten untuk memeriksa sesi ini.');
    }
  }
  if ((data.status !== 'upcoming' && data.status !== 'open' && data.status !== 'closed') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date)) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(data.startTime)) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(data.endTime)) ||
      (data.openedAt != null && !(data.openedAt instanceof Timestamp))) {
    throw new Error('Format data jadwal tidak valid. Hubungi asisten untuk memeriksa sesi ini.');
  }
  return { ...data, id, openedAt: data.openedAt ?? null } as Session;
}

type ScheduleState = { sessions: Session[]; loading: boolean };

export function subscribeSchedule(
  uid: string,
  role: Role,
  onChange: (state: ScheduleState) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  let generation = 0;
  let stopClasses = () => {};
  let stopSessions: (() => void)[] = [];

  function clearSessions() {
    generation++;
    stopSessions.forEach((stop) => stop());
    stopSessions = [];
  }

  function stop() {
    if (!active) return;
    active = false;
    stopClasses();
    clearSessions();
  }

  function fail(error: unknown) {
    if (!active) return;
    stop();
    onError(error);
  }

  function watchSessions(queries: Query[]) {
    clearSessions();
    const current = generation;
    const results = new Map<number, Session[]>();
    onChange({ sessions: [], loading: queries.length > 0 });

    queries.forEach((sessionsQuery, index) => {
      const unsubscribe = onSnapshot(sessionsQuery, (snapshot) => {
        if (!active || current !== generation) return;
        try {
          results.set(index, snapshot.docs.map((item) => parseSession(item.id, item.data())));
          if (results.size !== queries.length) return;
          const sessions = [...results.values()].flat().sort((a, b) =>
            `${a.date} ${a.startTime} ${a.id}`.localeCompare(`${b.date} ${b.startTime} ${b.id}`));
          onChange({ sessions, loading: false });
        } catch (error) {
          fail(error);
        }
      }, (error) => {
        if (current === generation) fail(error);
      });
      stopSessions.push(unsubscribe);
    });
  }

  async function start() {
    try {
      const { db } = await import('./firebase');
      if (!active) return;
      if (role === 'asisten') {
        watchSessions([query(collection(db, 'sessions'), where('assistantId', '==', uid))]);
        return;
      }

      let previousClasses: string | null = null;
      stopClasses = onSnapshot(query(collection(db, 'classes'), where('studentIds', 'array-contains', uid)), (snapshot) => {
        if (!active) return;
        const classIds = snapshot.docs.map((item) => item.id).sort();
        const key = JSON.stringify(classIds);
        if (key === previousClasses) return;
        previousClasses = key;
        watchSessions(classIds.map((classId) =>
          query(collection(db, 'sessions'), where('classId', '==', classId))));
      }, fail);
    } catch (error) {
      fail(error);
    }
  }

  onChange({ sessions: [], loading: true });
  void start();
  return stop;
}
