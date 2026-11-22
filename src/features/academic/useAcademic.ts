import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { mutationError } from '@/lib/mutations';
import type { Role } from '@/types/user';

import {
  subscribeAssistantClasses,
  subscribeAssistantSession,
  subscribeClassRoster,
  subscribeClassSessions,
  subscribeSchedule,
  subscribeSessionAttendance,
  subscribeSessionReviewSummary,
  subscribeStudentClasses,
} from './listeners';
import type {
  AcademicClass,
  AcademicSession,
  AttendanceRecord,
  Enrollment,
  ReviewSummary,
} from './types';

type Subscribe<T> = (
  onChange: (value: T, loading?: boolean) => void,
  onError: (error: unknown) => void,
) => () => void;
type LiveState<T> = {
  key: string;
  value: T;
  loading: boolean;
  error: string | null;
};

function useLive<T>(key: string, subscribe: Subscribe<T>, emptyValue: T) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LiveState<T>>({
    key,
    value: emptyValue,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!key) return;
    return subscribe(
      (value, loading = false) => setState({ key, value, loading, error: null }),
      (error) => {
        setState({
          key,
          value: emptyValue,
          loading: false,
          error: mutationError(error),
        });
      },
    );
  }, [key, subscribe, attempt, emptyValue]);

  const retry = useCallback(() => {
    setState({ key, value: emptyValue, loading: true, error: null });
    setAttempt((value) => value + 1);
  }, [key, emptyValue]);

  if (state.key !== key || !key) return { value: emptyValue, loading: !!key, error: null, retry };
  return { ...state, retry };
}

const EMPTY_ARRAY: never[] = [];
const EMPTY_SUMMARY: ReviewSummary = {
  id: '',
  totalSubmitted: 0,
  positiveCount: 0,
  neutralCount: 0,
  negativeCount: 0,
  failedCount: 0,
  pendingCount: 0,
};

const AssistantClassesContext = createContext<ReturnType<typeof useOwnedClasses> | null>(null);

export function useSchedule(uid: string | undefined, role: Role | null) {
  const subscribe = useCallback<Subscribe<AcademicSession[]>>(
    (onChange, onError) =>
      uid && role
        ? subscribeSchedule(
            uid,
            role,
            ({ sessions, loading }) => onChange(sessions, loading),
            onError,
          )
        : () => {},
    [uid, role],
  );
  return useLive(uid && role ? `${uid}:${role}` : '', subscribe, EMPTY_ARRAY);
}

function useOwnedClasses(uid: string | undefined) {
  const subscribe = useCallback<Subscribe<AcademicClass[]>>(
    (onChange, onError) => (uid ? subscribeAssistantClasses(uid, onChange, onError) : () => {}),
    [uid],
  );
  return useLive(uid ?? '', subscribe, EMPTY_ARRAY);
}

export function AssistantClassesProvider({ uid, children }: { uid?: string; children: ReactNode }) {
  const classes = useOwnedClasses(uid);
  return createElement(AssistantClassesContext.Provider, { value: classes }, children);
}

export function useAssistantClasses() {
  const classes = useContext(AssistantClassesContext);
  if (!classes) throw new Error('Daftar kelas belum tersedia.');
  return classes;
}

export function useClassRoster(uid: string | undefined, classId: string | null) {
  const key = uid && classId ? `${uid}:${classId}` : '';
  const subscribe = useCallback<Subscribe<Enrollment[]>>(
    (onChange, onError) =>
      uid && classId ? subscribeClassRoster(uid, classId, onChange, onError) : () => {},
    [uid, classId],
  );
  return useLive(key, subscribe, EMPTY_ARRAY);
}

export function useClassSessions(classInfo: AcademicClass | null) {
  const { id, name, timeZone } = classInfo ?? {};
  const subscribe = useCallback<Subscribe<AcademicSession[]>>(
    (onChange, onError) =>
      id && name && timeZone
        ? subscribeClassSessions({ id, name, timeZone }, onChange, onError)
        : () => {},
    [id, name, timeZone],
  );
  return useLive(id ?? '', subscribe, EMPTY_ARRAY);
}

export function useAssistantSession(classId: string | null, sessionId: string | null) {
  const classes = useAssistantClasses();
  const classInfo = classes.value.find((item) => item.id === classId);
  const { id, name, timeZone } = classInfo ?? {};
  const subscribe = useCallback<Subscribe<AcademicSession | null>>(
    (onChange, onError) =>
      id && name && timeZone && sessionId
        ? subscribeAssistantSession({ id, name, timeZone }, sessionId, onChange, onError)
        : () => {},
    [id, name, timeZone, sessionId],
  );
  const session = useLive(id && sessionId ? `${id}:${sessionId}` : '', subscribe, null);
  if (!classInfo && (classes.loading || classes.error)) {
    return { ...session, loading: classes.loading, error: classes.error, retry: classes.retry };
  }
  return session;
}

export function useSessionAttendance(uid: string | undefined, sessionId: string | null) {
  const key = uid && sessionId ? `${uid}:${sessionId}` : '';
  const subscribe = useCallback<Subscribe<AttendanceRecord[]>>(
    (onChange, onError) =>
      uid && sessionId ? subscribeSessionAttendance(uid, sessionId, onChange, onError) : () => {},
    [uid, sessionId],
  );
  return useLive(key, subscribe, EMPTY_ARRAY);
}

export function useSessionReviewSummary(
  uid: string | undefined,
  classId: string | null,
  sessionId: string | null,
) {
  const key = uid && classId && sessionId ? `${uid}:${classId}:${sessionId}` : '';
  const subscribe = useCallback<Subscribe<ReviewSummary>>(
    (onChange, onError) =>
      uid && classId && sessionId
        ? subscribeSessionReviewSummary(uid, classId, sessionId, onChange, onError)
        : () => {},
    [uid, classId, sessionId],
  );
  return useLive(key, subscribe, EMPTY_SUMMARY);
}

export function useStudentClasses(uid: string | undefined) {
  const subscribe = useCallback<Subscribe<AcademicClass[]>>(
    (onChange, onError) => (uid ? subscribeStudentClasses(uid, onChange, onError) : () => {}),
    [uid],
  );
  return useLive(uid ?? '', subscribe, EMPTY_ARRAY);
}
