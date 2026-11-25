import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { subscribeLabs, subscribeLabSchedules } from '@/lib/labs';
import {
  MAX_LOCATION_AGE_MS,
  locationError,
  watchUserLocation,
  type DeviceLocation,
  type LocationError,
} from '@/lib/location';
import { mutationError } from '@/lib/mutations';
import type { Lab, LabSchedule } from './types';

type LiveState<T> = { items: T[]; loading: boolean; offline: boolean; error: string | null };
type Subscribe<T> = (
  onChange: (items: T[], offline: boolean) => void,
  onError: (error: unknown) => void,
) => () => void;

function useCollection<T>(key: string, subscribe: Subscribe<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; value: LiveState<T> } | null>(null);
  const subscriptionKey = key ? `${key}:${attempt}` : '';
  useFocusEffect(
    useCallback(() => {
      if (!subscriptionKey) return;
      return subscribe(
        (items, offline) =>
          setState({
            key: subscriptionKey,
            value: { items, offline, loading: false, error: null },
          }),
        (error) =>
          setState({
            key: subscriptionKey,
            value: { items: [], offline: false, loading: false, error: mutationError(error) },
          }),
      );
    }, [subscribe, subscriptionKey]),
  );
  return {
    ...(state?.key === subscriptionKey
      ? state.value
      : { items: [] as T[], loading: !!key, offline: false, error: null }),
    retry: () => {
      setState(null);
      setAttempt((value) => value + 1);
    },
  };
}

export function useLabs() {
  const { user, phase } = useAuth();
  const subscribe = useCallback<Subscribe<Lab>>(
    (onChange, onError) => subscribeLabs({ onChange, onError }),
    [],
  );
  return useCollection(phase === 'active' ? (user?.uid ?? '') : '', subscribe);
}

export function useLabSchedules(labId: string | null) {
  const { user, phase } = useAuth();
  const subscribe = useCallback<Subscribe<LabSchedule>>(
    (onChange, onError) => (labId ? subscribeLabSchedules(labId, { onChange, onError }) : () => {}),
    [labId],
  );
  return useCollection(
    phase === 'active' && user && labId ? `${user.uid}:${labId}` : '',
    subscribe,
  );
}

export function useDeviceLocation(enabled = true, requestOnOpen = false) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [attempt, setAttempt] = useState(0);
  const [requestPermission, setRequestPermission] = useState(requestOnOpen);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [state, setState] = useState<{
    scope: string;
    sample: DeviceLocation | null;
    error: LocationError | null;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const locationScope = uid ? `${uid}:${attempt}` : '';
  useEffect(() => {
    const listener = AppState.addEventListener('change', (status) => {
      setForeground(status === 'active');
      setNow(Date.now());
    });
    return () => listener.remove();
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !foreground || !locationScope) return;
      let active = true;
      let stop = () => {};
      const update = (sample: DeviceLocation) => {
        if (active) {
          setState({ scope: locationScope, sample, error: null });
          setNow(Date.now());
        }
      };
      const fail = (error: unknown) => {
        if (active) setState({ scope: locationScope, sample: null, error: locationError(error) });
      };
      void watchUserLocation(update, fail, requestPermission)
        .then((unsubscribe) => {
          if (!active) unsubscribe();
          else stop = unsubscribe;
        })
        .catch(fail);
      const timer = setInterval(() => setNow(Date.now()), 5_000);
      return () => {
        active = false;
        clearInterval(timer);
        stop();
      };
    }, [enabled, foreground, locationScope, requestPermission]),
  );
  const current = state?.scope === locationScope ? state : null;
  const stale = !!current?.sample && now - current.sample.capturedAt > MAX_LOCATION_AGE_MS;
  return {
    sample: enabled && foreground && !stale ? (current?.sample ?? null) : null,
    loading: enabled && foreground && !!locationScope && !current,
    stale,
    error: enabled ? (current?.error ?? null) : null,
    now,
    retry: () => {
      setRequestPermission(true);
      setState(null);
      setAttempt((value) => value + 1);
    },
    openSettings: () => {
      void Linking.openSettings();
    },
  };
}
