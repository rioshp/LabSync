import { Timestamp, collection, doc, orderBy, query, where, type QueryConstraint, type QuerySnapshot } from '@react-native-firebase/firestore';

import type { Role } from '@/types/user';

import type {
  AcademicClass,
  AcademicSession,
  AttendanceRecord,
  Enrollment,
  Practicum,
  ReviewSummary,
  ScheduleState,
} from './types';

type Change<T> = (value: T, offline?: boolean) => void;
type Stop = () => void;

const noop = () => {};

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Data akademik tidak lengkap (${key}). Hubungi asisten untuk memperbaikinya.`);
  }
  return value.trim();
}

function optionalTimestamp(value: unknown): Timestamp | null {
  if (value == null) return null;
  if (!(value instanceof Timestamp)) throw new Error('Format waktu pada data sesi tidak valid.');
  return value;
}

function timestamp(value: unknown, name: string): Timestamp {
  if (!(value instanceof Timestamp)) throw new Error(`Waktu ${name} pada sesi tidak valid.`);
  return value;
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function localParts(date: Date, timeZone: string) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${pick(dateParts, 'year')}-${pick(dateParts, 'month')}-${pick(dateParts, 'day')}`,
    time: `${pick(timeParts, 'hour')}:${pick(timeParts, 'minute')}`,
  };
}

export function parsePracticum(id: string, data: Record<string, unknown>): Practicum {
  const status = data.status;
  if (status !== 'active' && status !== 'archived') throw new Error('Status praktikum tidak valid.');
  return {
    id,
    assistantUid: stringField(data, 'assistantUid'),
    name: stringField(data, 'name'),
    status,
    activeClassCount: numberField(data, 'activeClassCount'),
    totalClassCount: numberField(data, 'totalClassCount'),
  };
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
    practicumId: stringField(data, 'practicumId'),
    practicumName: stringField(data, 'practicumName'),
    assistantUid: stringField(data, 'assistantUid'),
    name: stringField(data, 'name'),
    timeZone,
    status,
    unfinishedSessionCount: numberField(data, 'unfinishedSessionCount'),
  };
}

export function parseAcademicSession(
  id: string,
  data: Record<string, unknown>,
  classInfo: Pick<AcademicClass, 'id' | 'name' | 'practicumName' | 'timeZone'>,
): AcademicSession {
  const status = data.status;
  if (status !== 'scheduled' && status !== 'open' && status !== 'closed' && status !== 'cancelled') {
    throw new Error('Status sesi tidak valid.');
  }
  const startsAt = timestamp(data.startsAt, 'mulai');
  const endsAt = timestamp(data.endsAt, 'selesai');
  if (endsAt.toMillis() <= startsAt.toMillis()) throw new Error('Waktu selesai sesi harus setelah waktu mulai.');
  const start = localParts(startsAt.toDate(), classInfo.timeZone);
  const end = localParts(endsAt.toDate(), classInfo.timeZone);
  return {
    id,
    classId: classInfo.id,
    className: classInfo.name,
    practicum: classInfo.practicumName,
    assistantUid: stringField(data, 'assistantUid'),
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
    openedAt: optionalTimestamp(data.openedAt),
    closedAt: optionalTimestamp(data.closedAt),
    cancelledAt: optionalTimestamp(data.cancelledAt),
  };
}

export function parseEnrollment(id: string, data: Record<string, unknown>): Enrollment {
  const status = data.status;
  if (status !== 'active' && status !== 'removed') throw new Error('Status peserta kelas tidak valid.');
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
    pendingCount: Math.max(0, totalSubmitted - positiveCount - neutralCount - negativeCount - failedCount),
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
  let rootOffline = false;
  let rootStop = noop;
  const entries = new Map<string, {
    info: AcademicClass | null;
    sessions: AcademicSession[];
    ready: boolean;
    classOffline: boolean;
    sessionOffline: boolean;
    sessionGeneration: number;
    stopClass: Stop;
    stopSessions: Stop;
  }>();

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
    const sessions = values.flatMap((entry) => entry.sessions).sort((a, b) =>
      a.startsAt.toMillis() - b.startsAt.toMillis() || a.id.localeCompare(b.id));
    onChange({
      sessions,
      loading: !rootReady || values.some((entry) => !entry.ready),
      offline: rootOffline || values.some((entry) => entry.classOffline || entry.sessionOffline),
    });
  };

  async function start() {
    try {
      const [{ db }, firestore] = await Promise.all([
        import('@/lib/firebase'),
        import('@react-native-firebase/firestore'),
      ]);
      if (!active) return;
      const now = Date.now();
      const scheduleStart = Timestamp.fromMillis(now - 90 * 24 * 60 * 60 * 1000);
      const scheduleEnd = Timestamp.fromMillis(now + 365 * 24 * 60 * 60 * 1000);

      const reconcile = (classIds: string[]) => {
        const next = new Set(classIds);
        for (const [id, entry] of entries) {
          if (next.has(id)) continue;
          entry.stopClass();
          entry.stopSessions();
          entries.delete(id);
        }
        for (const classId of next) {
          if (entries.has(classId)) continue;
          const entry = { info: null as AcademicClass | null, sessions: [] as AcademicSession[], ready: false, classOffline: false, sessionOffline: false, sessionGeneration: 0, stopClass: noop, stopSessions: noop };
          entries.set(classId, entry);
          entry.stopClass = firestore.onSnapshot(doc(db, 'classes', classId), { includeMetadataChanges: true }, (snapshot) => {
            if (!active || entries.get(classId) !== entry) return;
            try {
              entry.classOffline = snapshot.metadata.fromCache;
              const previous = entry.info;
              const next = snapshot.exists() ? parseAcademicClass(snapshot.id, snapshot.data()) : null;
              entry.info = next;

              if (!next || next.status !== 'active') {
                entry.sessionGeneration += 1;
                entry.stopSessions();
                entry.stopSessions = noop;
                entry.sessions = [];
                entry.sessionOffline = false;
                entry.ready = true;
                publish();
                return;
              }

              // Cache metadata does not change the session query or its class display values.
              if (previous?.status === 'active' && previous.name === next.name &&
                previous.practicumName === next.practicumName && previous.timeZone === next.timeZone) {
                publish();
                return;
              }

              const generation = ++entry.sessionGeneration;
              function isCurrent() {
                return active && entries.get(classId) === entry && entry.sessionGeneration === generation;
              }
              entry.stopSessions();
              entry.ready = false;
              entry.stopSessions = firestore.onSnapshot(
                query(
                  collection(db, 'classes', classId, 'sessions'),
                  where('startsAt', '>=', scheduleStart),
                  where('startsAt', '<=', scheduleEnd),
                  orderBy('startsAt', 'asc'),
                ),
                { includeMetadataChanges: true },
                (sessionsSnapshot) => {
                  if (!isCurrent()) return;
                  try {
                    entry.sessions = sessionsSnapshot.docs.map((item) =>
                      parseAcademicSession(item.id, item.data(), next));
                    entry.sessionOffline = sessionsSnapshot.metadata.fromCache;
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
              publish();
            } catch (error) {
              fail(error);
            }
          }, fail);
        }
        rootReady = true;
        publish();
      };

      onChange({ sessions: [], loading: true, offline: false });
      if (role === 'asisten') {
        rootStop = firestore.onSnapshot(
          query(collection(db, 'classes'), where('assistantUid', '==', uid)),
          { includeMetadataChanges: true },
          (snapshot) => {
            rootOffline = snapshot.metadata.fromCache;
            reconcile(snapshot.docs.map((item) => item.id));
          },
          fail,
        );
      } else {
        rootStop = firestore.onSnapshot(
          query(collection(db, 'enrollments'), where('studentUid', '==', uid), where('status', '==', 'active')),
          { includeMetadataChanges: true },
          (snapshot) => {
            rootOffline = snapshot.metadata.fromCache;
            reconcile(snapshot.docs.map((item) => item.data().classId).filter((id): id is string => typeof id === 'string'));
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

  void Promise.all([import('@/lib/firebase'), import('@react-native-firebase/firestore')])
    .then(([{ db }, firestore]) => {
      if (!active) return;
      unsubscribe = firestore.onSnapshot(
        query(collection(db, path), ...constraints),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!active) return;
          try {
            onChange(select(snapshot), snapshot.metadata.fromCache);
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

export function subscribeAssistantPracticums(uid: string, onChange: Change<Practicum[]>, onError: (error: unknown) => void): Stop {
  return watchQuery('practicums', [where('assistantUid', '==', uid)], (snapshot) =>
    snapshot.docs
      .map((item) => parsePracticum(item.id, item.data()))
      .sort((a, b) => a.name.localeCompare(b.name)), onChange, onError);
}

export function subscribeAssistantClasses(uid: string, practicumId: string, onChange: Change<AcademicClass[]>, onError: (error: unknown) => void): Stop {
  return watchQuery('classes', [
    where('assistantUid', '==', uid), where('practicumId', '==', practicumId), orderBy('name', 'asc'),
  ], (snapshot) => snapshot.docs.map((item) => parseAcademicClass(item.id, item.data()))
    .sort((a, b) => a.name.localeCompare(b.name)), onChange, onError);
}

export function subscribeClassRoster(uid: string, classId: string, onChange: Change<Enrollment[]>, onError: (error: unknown) => void): Stop {
  return watchQuery('enrollments', [
    where('assistantUid', '==', uid), where('classId', '==', classId), where('status', '==', 'active'),
  ], (snapshot) => snapshot.docs.map((item) => parseEnrollment(item.id, item.data()))
    .sort((a, b) => a.studentNameSnapshot.localeCompare(b.studentNameSnapshot)), onChange, onError);
}

export function subscribeClassSessions(uid: string, classId: string, onChange: Change<AcademicSession[]>, onError: (error: unknown) => void): Stop {
  let active = true;
  let stopSnapshot = noop;
  let stopClass = noop;
  let classOffline = false;
  void import('@/lib/firebase').then(({ db }) => import('@react-native-firebase/firestore').then((firestore) => {
    if (!active) return;
    stopClass = firestore.onSnapshot(doc(db, 'classes', classId), { includeMetadataChanges: true }, (classSnapshot) => {
      if (!active || !classSnapshot.exists()) return;
      try {
        classOffline = classSnapshot.metadata.fromCache;
        const classInfo = parseAcademicClass(classSnapshot.id, classSnapshot.data());
        if (classInfo.assistantUid !== uid) throw new Error('Kelas ini tidak dapat diakses oleh akun asisten.');
        stopSnapshot();
        stopSnapshot = firestore.onSnapshot(
          query(collection(db, 'classes', classId, 'sessions'), orderBy('startsAt', 'asc')),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (!active) return;
            try {
              onChange(snapshot.docs.map((item) => parseAcademicSession(item.id, item.data(), classInfo)), classOffline || snapshot.metadata.fromCache);
            } catch (error) {
              onError(error);
            }
          },
          onError,
        );
      } catch (error) {
        onError(error);
      }
    }, onError);
  })).catch(onError);
  return () => { active = false; stopClass(); stopSnapshot(); };
}

export function subscribeAssistantSession(uid: string, classId: string, sessionId: string, onChange: Change<AcademicSession | null>, onError: (error: unknown) => void): Stop {
  let active = true;
  let classInfo: AcademicClass | null = null;
  let sessionData: Record<string, unknown> | null = null;
  let classReady = false;
  let sessionReady = false;
  let classOffline = false;
  let sessionOffline = false;
  let stopClass = noop;
  let stopSession = noop;
  const publish = () => {
    if (!active || !classReady || !sessionReady) return;
    if (!classInfo || !sessionData) {
      onChange(null, classOffline || sessionOffline);
      return;
    }
    try {
      if (classInfo.assistantUid !== uid) throw new Error('Sesi ini tidak dapat diakses oleh akun asisten.');
      onChange(parseAcademicSession(sessionId, sessionData, classInfo), classOffline || sessionOffline);
    } catch (error) {
      onError(error);
    }
  };
  void import('@/lib/firebase').then(({ db }) => import('@react-native-firebase/firestore').then((firestore) => {
    if (!active) return;
    stopClass = firestore.onSnapshot(doc(db, 'classes', classId), { includeMetadataChanges: true }, (snapshot) => {
      if (!active) return;
      try {
        classInfo = snapshot.exists() ? parseAcademicClass(snapshot.id, snapshot.data()) : null;
        classOffline = snapshot.metadata.fromCache;
        classReady = true;
        publish();
      } catch (error) {
        onError(error);
      }
    }, onError);
    stopSession = firestore.onSnapshot(doc(db, 'classes', classId, 'sessions', sessionId), { includeMetadataChanges: true }, (snapshot) => {
      if (!active) return;
      sessionData = snapshot.exists() ? snapshot.data() : null;
      sessionOffline = snapshot.metadata.fromCache;
      sessionReady = true;
      publish();
    }, onError);
  })).catch(onError);
  return () => { active = false; stopClass(); stopSession(); };
}

export function subscribeSessionAttendance(uid: string, sessionId: string, onChange: Change<AttendanceRecord[]>, onError: (error: unknown) => void): Stop {
  return watchQuery('attendances', [
    where('assistantUid', '==', uid), where('sessionId', '==', sessionId), orderBy('checkedInAt', 'desc'),
  ], (snapshot) => snapshot.docs.map((item) => parseAttendance(item.id, item.data())), onChange, onError);
}

export function subscribeSessionReviewSummary(uid: string, classId: string, sessionId: string, onChange: Change<ReviewSummary>, onError: (error: unknown) => void): Stop {
  return watchQuery('reviewSummaries', [
    where('assistantUid', '==', uid), where('classId', '==', classId),
  ], (snapshot) => {
    const found = snapshot.docs.find((item) => item.id === sessionId);
    return parseReviewSummary(sessionId, found?.data());
  }, onChange, onError);
}
