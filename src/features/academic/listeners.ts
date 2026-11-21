import {
  Timestamp,
  collection,
  doc,
  documentId,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type QuerySnapshot,
} from '@react-native-firebase/firestore';

import type { Role } from '@/types/user';

import { classLocalDateTime } from './time';

import type {
  AcademicClass,
  AcademicSession,
  AttendanceRecord,
  Enrollment,
  ReviewSummary,
  ScheduleState,
} from './types';

type Change<T> = (value: T) => void;
type Stop = () => void;

const noop = () => {};

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Data akademik tidak lengkap (${key}). Hubungi asisten untuk memperbaikinya.`);
  }
  return value.trim();
}

function timestamp(value: unknown, name: string): Timestamp {
  if (!(value instanceof Timestamp)) throw new Error(`Waktu ${name} pada sesi tidak valid.`);
  return value;
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function parseAcademicClass(id: string, data: Record<string, unknown>): AcademicClass {
  const status = data.status;
  if (status !== 'active' && status !== 'archived') throw new Error('Status kelas tidak valid.');
  const timeZone = stringField(data, 'timeZone');
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
  } catch {
    throw new Error('Zona waktu kelas tidak valid. Perbarui jadwal kelas.');
  }
  return {
    id,
    name: stringField(data, 'name'),
    timeZone,
    status,
    unfinishedSessionCount: numberField(data, 'unfinishedSessionCount'),
  };
}

export function parseAcademicSession(
  id: string,
  data: Record<string, unknown>,
  classInfo: Pick<AcademicClass, 'id' | 'name' | 'timeZone'>,
): AcademicSession {
  const status = data.status;
  if (
    status !== 'scheduled' &&
    status !== 'open' &&
    status !== 'closed' &&
    status !== 'cancelled'
  ) {
    throw new Error('Status sesi tidak valid.');
  }
  const startsAt = timestamp(data.startsAt, 'mulai');
  const endsAt = timestamp(data.endsAt, 'selesai');
  if (endsAt.toMillis() <= startsAt.toMillis())
    throw new Error('Waktu selesai sesi harus setelah waktu mulai.');
  const start = classLocalDateTime(startsAt.toDate(), classInfo.timeZone);
  const end = classLocalDateTime(endsAt.toDate(), classInfo.timeZone);
  return {
    id,
    classId: classInfo.id,
    className: classInfo.name,
    module: stringField(data, 'moduleTitle'),
    room: stringField(data, 'room'),
    startsAt,
    endsAt,
    date: start.date,
    endDate: end.date,
    startTime: start.time,
    endTime: end.time,
    timeZone: classInfo.timeZone,
    status,
  };
}

export function parseEnrollment(id: string, data: Record<string, unknown>): Enrollment {
  const status = data.status;
  if (status !== 'active' && status !== 'removed')
    throw new Error('Status peserta kelas tidak valid.');
  return {
    id,
    classId: stringField(data, 'classId'),
    assistantUid: stringField(data, 'assistantUid'),
    studentUid: stringField(data, 'studentUid'),
    studentNameSnapshot: stringField(data, 'studentNameSnapshot'),
    nimSnapshot: stringField(data, 'nimSnapshot'),
    status,
  };
}

export function parseAttendance(id: string, data: Record<string, unknown>): AttendanceRecord {
  return {
    id,
    studentUid: stringField(data, 'studentUid'),
    studentNameSnapshot: stringField(data, 'studentNameSnapshot'),
    nimSnapshot: stringField(data, 'nimSnapshot'),
    checkedInAt: timestamp(data.checkedInAt, 'presensi'),
  };
}

function parseReviewSummary(id: string, data?: Record<string, unknown>): ReviewSummary {
  const totalSubmitted = numberField(data ?? {}, 'totalSubmitted');
  const positiveCount = numberField(data ?? {}, 'positiveCount');
  const neutralCount = numberField(data ?? {}, 'neutralCount');
  const negativeCount = numberField(data ?? {}, 'negativeCount');
  const failedCount = numberField(data ?? {}, 'failedCount');
  return {
    id,
    totalSubmitted,
    positiveCount,
    neutralCount,
    negativeCount,
    failedCount,
    pendingCount: Math.max(
      0,
      totalSubmitted - positiveCount - neutralCount - negativeCount - failedCount,
    ),
  };
}

/** Watches classes and their nested sessions for the signed-in role. */
export function subscribeSchedule(
  uid: string,
  role: Role,
  onChange: Change<ScheduleState>,
  onError: (error: unknown) => void,
): Stop {
  let active = true;
  let rootReady = false;
  let rootStop = noop;
  type ScheduleEntry = {
    info: AcademicClass | null;
    sessions: AcademicSession[];
    ready: boolean;
    sessionGeneration: number;
    stopClass: Stop;
    stopSessions: Stop;
  };
  const entries = new Map<string, ScheduleEntry>();

  const stop = () => {
    if (!active) return;
    active = false;
    rootStop();
    for (const entry of entries.values()) {
      entry.stopClass();
      entry.stopSessions();
    }
    entries.clear();
  };

  const fail = (error: unknown) => {
    if (!active) return;
    onError(error);
    stop();
  };

  const publish = () => {
    if (!active) return;
    const values = [...entries.values()];
    const sessions = values
      .flatMap((entry) => entry.sessions)
      .sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis() || a.id.localeCompare(b.id));
    onChange({
      sessions,
      loading: !rootReady || values.some((entry) => !entry.ready),
    });
  };

  async function start() {
    try {
      const { db } = await import('@/lib/firebase');
      if (!active) return;
      const now = Date.now();
      const scheduleStart = Timestamp.fromMillis(now - 90 * 24 * 60 * 60 * 1000);
      const scheduleEnd = Timestamp.fromMillis(now + 365 * 24 * 60 * 60 * 1000);

      function updateClass(classId: string, entry: ScheduleEntry, next: AcademicClass | null) {
        if (!active || entries.get(classId) !== entry) return;
        const previous = entry.info;
        entry.info = next;

        if (!next || next.status !== 'active') {
          entry.sessionGeneration += 1;
          entry.stopSessions();
          entry.stopSessions = noop;
          entry.sessions = [];
          entry.ready = true;
          return;
        }

        if (
          previous?.status === 'active' &&
          previous.name === next.name &&
          previous.timeZone === next.timeZone
        ) {
          return;
        }

        const generation = ++entry.sessionGeneration;
        // Listener lama bisa masih mengirim callback saat kelas berubah atau peserta dikeluarkan.
        const isCurrent = () =>
          active && entries.get(classId) === entry && entry.sessionGeneration === generation;
        entry.stopSessions();
        entry.ready = false;
        entry.stopSessions = onSnapshot(
          query(
            collection(db, 'classes', classId, 'sessions'),
            where('startsAt', '>=', scheduleStart),
            where('startsAt', '<=', scheduleEnd),
            orderBy('startsAt', 'asc'),
          ),
          (snapshot) => {
            if (!isCurrent()) return;
            try {
              entry.sessions = snapshot.docs.map((item) =>
                parseAcademicSession(item.id, item.data(), next),
              );
              entry.ready = true;
              publish();
            } catch (error) {
              fail(error);
            }
          },
          (error) => {
            if (isCurrent()) fail(error);
          },
        );
      }

      function reconcile(classIds: string[], ownedClasses?: Map<string, AcademicClass>) {
        const next = new Set(classIds);
        for (const [id, entry] of entries) {
          if (next.has(id)) continue;
          entry.stopClass();
          entry.stopSessions();
          entries.delete(id);
        }
        for (const classId of next) {
          const existing = entries.get(classId);
          const info = ownedClasses?.get(classId);
          if (existing) {
            if (info) updateClass(classId, existing, info);
            continue;
          }
          const entry: ScheduleEntry = {
            info: null,
            sessions: [],
            ready: false,
            sessionGeneration: 0,
            stopClass: noop,
            stopSessions: noop,
          };
          entries.set(classId, entry);
          if (info) {
            updateClass(classId, entry, info);
            continue;
          }
          // Enrolment praktikan hanya berisi ID kelas, sehingga detail kelas dibaca terpisah.
          entry.stopClass = onSnapshot(
            doc(db, 'classes', classId),
            (snapshot) => {
              if (!active || entries.get(classId) !== entry) return;
              try {
                const classInfo = snapshot.exists()
                  ? parseAcademicClass(snapshot.id, snapshot.data())
                  : null;
                updateClass(classId, entry, classInfo);
                publish();
              } catch (error) {
                fail(error);
              }
            },
            fail,
          );
        }
        rootReady = true;
        publish();
      }

      onChange({ sessions: [], loading: true });
      if (role === 'asisten') {
        rootStop = onSnapshot(
          query(collection(db, 'classes'), where('assistantUid', '==', uid)),
          (snapshot) => {
            if (!active) return;
            try {
              const ownClasses = new Map(
                snapshot.docs.map((item) => [item.id, parseAcademicClass(item.id, item.data())]),
              );
              reconcile([...ownClasses.keys()], ownClasses);
            } catch (error) {
              fail(error);
            }
          },
          fail,
        );
      } else {
        rootStop = onSnapshot(
          query(
            collection(db, 'enrollments'),
            where('studentUid', '==', uid),
            where('status', '==', 'active'),
          ),
          (snapshot) => {
            reconcile(
              snapshot.docs
                .map((item) => item.data().classId)
                .filter((id): id is string => typeof id === 'string'),
            );
          },
          fail,
        );
      }
    } catch (error) {
      fail(error);
    }
  }

  void start();
  return stop;
}

/** Share the attach, error, and cleanup behavior for independent Firestore queries. */
function watchQuery<T>(
  path: string,
  constraints: QueryConstraint[],
  select: (snapshot: QuerySnapshot) => T,
  onChange: Change<T>,
  onError: (error: unknown) => void,
): Stop {
  let active = true;
  let unsubscribe = noop;

  function reportError(error: unknown) {
    if (active) onError(error);
  }

  void import('@/lib/firebase')
    .then(({ db }) => {
      if (!active) return;
      unsubscribe = onSnapshot(
        query(collection(db, path), ...constraints),
        (snapshot) => {
          if (!active) return;
          try {
            onChange(select(snapshot));
          } catch (error) {
            reportError(error);
          }
        },
        reportError,
      );
    })
    .catch(reportError);

  return () => {
    active = false;
    unsubscribe();
  };
}

export function subscribeAssistantClasses(
  uid: string,
  onChange: Change<AcademicClass[]>,
  onError: (error: unknown) => void,
): Stop {
  return watchQuery(
    'classes',
    [where('assistantUid', '==', uid)],
    (snapshot) =>
      snapshot.docs
        .map((item) => parseAcademicClass(item.id, item.data()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    onChange,
    onError,
  );
}

export function subscribeClassRoster(
  uid: string,
  classId: string,
  onChange: Change<Enrollment[]>,
  onError: (error: unknown) => void,
): Stop {
  return watchQuery(
    'enrollments',
    [
      where('assistantUid', '==', uid),
      where('classId', '==', classId),
      where('status', '==', 'active'),
    ],
    (snapshot) =>
      snapshot.docs
        .map((item) => parseEnrollment(item.id, item.data()))
        .sort((a, b) => a.studentNameSnapshot.localeCompare(b.studentNameSnapshot)),
    onChange,
    onError,
  );
}

export function subscribeClassSessions(
  classInfo: Pick<AcademicClass, 'id' | 'name' | 'timeZone'>,
  onChange: Change<AcademicSession[]>,
  onError: (error: unknown) => void,
): Stop {
  return watchQuery(
    'classes/' + classInfo.id + '/sessions',
    [orderBy('startsAt', 'asc')],
    (snapshot) =>
      snapshot.docs.map((item) => parseAcademicSession(item.id, item.data(), classInfo)),
    onChange,
    onError,
  );
}

export function subscribeAssistantSession(
  classInfo: Pick<AcademicClass, 'id' | 'name' | 'timeZone'>,
  sessionId: string,
  onChange: Change<AcademicSession | null>,
  onError: (error: unknown) => void,
): Stop {
  return watchQuery(
    'classes/' + classInfo.id + '/sessions',
    [where(documentId(), '==', sessionId)],
    ({ docs }) => (docs[0] ? parseAcademicSession(docs[0].id, docs[0].data(), classInfo) : null),
    onChange,
    onError,
  );
}

export function subscribeSessionAttendance(
  uid: string,
  sessionId: string,
  onChange: Change<AttendanceRecord[]>,
  onError: (error: unknown) => void,
): Stop {
  return watchQuery(
    'attendances',
    [
      where('assistantUid', '==', uid),
      where('sessionId', '==', sessionId),
      orderBy('checkedInAt', 'desc'),
    ],
    (snapshot) => snapshot.docs.map((item) => parseAttendance(item.id, item.data())),
    onChange,
    onError,
  );
}

export function subscribeSessionReviewSummary(
  uid: string,
  classId: string,
  sessionId: string,
  onChange: Change<ReviewSummary>,
  onError: (error: unknown) => void,
): Stop {
  return watchQuery(
    'reviewSummaries',
    [
      where('assistantUid', '==', uid),
      where('classId', '==', classId),
      where(documentId(), '==', sessionId),
    ],
    (snapshot) => parseReviewSummary(sessionId, snapshot.docs[0]?.data()),
    onChange,
    onError,
  );
}
