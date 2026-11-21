import { useCallback, useEffect, useState } from 'react';

import { mutationError } from '@/lib/mutations';

import {
  subscribeAssistantClasses,
  subscribeAssistantPracticums,
  subscribeAssistantSession,
  subscribeClassRoster,
  subscribeClassSessions,
  subscribeSessionAttendance,
  subscribeSessionReviewSummary,
} from './listeners';
import type {
  AcademicClass,
  AcademicSession,
  AttendanceRecord,
  Enrollment,
  Practicum,
  ReviewSummary,
} from './types';

type Subscribe<T> = (
  onChange: (value: T, offline?: boolean) => void,
  onError: (error: unknown) => void,
) => () => void;
type LiveState<T> = {
  key: string;
  value: T;
  loading: boolean;
  error: string | null;
  offline: boolean;
};

function useLive<T>(key: string, subscribe: Subscribe<T>, emptyValue: T) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LiveState<T>>({
    key,
    value: emptyValue,
    loading: true,
    error: null,
    offline: false,
  });

  useEffect(() => {
    if (!key) return;
    return subscribe(
      (value, offline = false) => setState({ key, value, loading: false, error: null, offline }),
      (error) => {
        setState({
          key,
          value: emptyValue,
          loading: false,
          error: mutationError(error),
          offline: false,
        });
      },
    );
  }, [key, subscribe, attempt, emptyValue]);

  const retry = useCallback(() => {
    setState({ key, value: emptyValue, loading: true, error: null, offline: false });
    setAttempt((value) => value + 1);
  }, [key, emptyValue]);

  if (state.key !== key || !key)
    return { value: emptyValue, loading: !!key, error: null, offline: false, retry };
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

export function useAssistantPracticums(uid: string | undefined) {
  const key = uid ?? '';
  const subscribe = useCallback<Subscribe<Practicum[]>>(
    (onChange, onError) => (key ? subscribeAssistantPracticums(key, onChange, onError) : () => {}),
    [key],
  );
  return useLive(key, subscribe, EMPTY_ARRAY as Practicum[]);
}

export function useAssistantClasses(uid: string | undefined, practicumId: string | null) {
  const key = uid && practicumId ? `${uid}:${practicumId}` : '';
  const subscribe = useCallback<Subscribe<AcademicClass[]>>(
    (onChange, onError) =>
      uid && practicumId
        ? subscribeAssistantClasses(uid, practicumId, onChange, onError)
        : () => {},
    [uid, practicumId],
  );
  return useLive(key, subscribe, EMPTY_ARRAY as AcademicClass[]);
}

export function useClassRoster(uid: string | undefined, classId: string | null) {
  const key = uid && classId ? `${uid}:${classId}` : '';
  const subscribe = useCallback<Subscribe<Enrollment[]>>(
    (onChange, onError) =>
      uid && classId ? subscribeClassRoster(uid, classId, onChange, onError) : () => {},
    [uid, classId],
  );
  return useLive(key, subscribe, EMPTY_ARRAY as Enrollment[]);
}

export function useClassSessions(uid: string | undefined, classId: string | null) {
  const key = uid && classId ? `${uid}:${classId}` : '';
  const subscribe = useCallback<Subscribe<AcademicSession[]>>(
    (onChange, onError) =>
      uid && classId ? subscribeClassSessions(uid, classId, onChange, onError) : () => {},
    [uid, classId],
  );
  return useLive(key, subscribe, EMPTY_ARRAY as AcademicSession[]);
}

export function useAssistantSession(
  uid: string | undefined,
  classId: string | null,
  sessionId: string | null,
) {
  const key = uid && classId && sessionId ? `${uid}:${classId}:${sessionId}` : '';
  const subscribe = useCallback<Subscribe<AcademicSession | null>>(
    (onChange, onError) =>
      uid && classId && sessionId
        ? subscribeAssistantSession(uid, classId, sessionId, onChange, onError)
        : () => {},
    [uid, classId, sessionId],
  );
  return useLive<AcademicSession | null>(key, subscribe, null);
}

export function useSessionAttendance(uid: string | undefined, sessionId: string | null) {
  const key = uid && sessionId ? `${uid}:${sessionId}` : '';
  const subscribe = useCallback<Subscribe<AttendanceRecord[]>>(
    (onChange, onError) =>
      uid && sessionId ? subscribeSessionAttendance(uid, sessionId, onChange, onError) : () => {},
    [uid, sessionId],
  );
  return useLive(key, subscribe, EMPTY_ARRAY as AttendanceRecord[]);
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
