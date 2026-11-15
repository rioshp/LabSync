import { onAuthStateChanged, type User } from '@react-native-firebase/auth';
import { doc, onSnapshot } from '@react-native-firebase/firestore';
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';

import { getAuthErrorMessage, parseUserProfile } from '@/lib/auth';
import type { Role, UserProfile } from '@/types/user';

type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
};

type AuthContextValue = AuthState & {
  role: Role | null;
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, profile: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let unsubscribeAuth = () => {};
    let unsubscribeProfile = () => {};

    async function subscribe() {
      try {
        // Native Firebase is unavailable during Expo's server rendering/build step.
        const { auth, db } = await import('@/lib/firebase');
        if (!active) return;
        unsubscribeAuth = onAuthStateChanged(auth, (user) => {
          if (!active) return;
          unsubscribeProfile();
          const current = ++generation;
          setState({ user, profile: null, loading: !!user, error: null });
          if (!user) return;

          unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), { includeMetadataChanges: true }, (snapshot) => {
            if (!active || current !== generation || snapshot.metadata.hasPendingWrites) return;
            const profile = parseUserProfile(snapshot.data());
            setState({
              user,
              profile,
              loading: false,
              error: profile ? null : 'Profil akun belum tersedia atau tidak valid. Hubungi pengelola jika masalah berlanjut.',
            });
          }, (error) => {
            if (!active || current !== generation) return;
            setState({ user, profile: null, loading: false, error: getAuthErrorMessage(error) });
          });
        }, (error) => {
          unsubscribeProfile();
          generation++;
          if (active) setState({ user: null, profile: null, loading: false, error: getAuthErrorMessage(error) });
        });
      } catch (error) {
        if (active) setState({ user: null, profile: null, loading: false, error: getAuthErrorMessage(error) });
      }
    }
    void subscribe();

    return () => {
      active = false;
      generation++;
      unsubscribeAuth();
      unsubscribeProfile();
    };
  }, [attempt]);

  function retry() {
    setState((previous) => ({ user: previous.user, profile: null, loading: true, error: null }));
    setAttempt((previous) => previous + 1);
  }

  return createElement(AuthContext.Provider, {
    value: { ...state, role: state.profile?.role ?? null, retry },
  }, children);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  return context;
}
