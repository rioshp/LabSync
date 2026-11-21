import { onAuthStateChanged, type User } from '@react-native-firebase/auth';
import { doc, onSnapshot } from '@react-native-firebase/firestore';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { getAuthErrorMessage, parseUserProfile } from '@/lib/auth';
import type { UserProfile } from '@/types/user';

type Phase = 'loading' | 'signed-out' | 'verify' | 'onboarding' | 'active' | 'disabled' | 'error';
type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  phase: Phase;
  error: string | null;
};
type AuthContextValue = AuthState & {
  role: UserProfile['role'] | null;
  loading: boolean;
  retry: () => void;
};

const initialState: AuthState = { user: null, profile: null, phase: 'loading', error: null };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let stopAuth = () => {};
    let stopProfile = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;

    function publish(
      user: User | null,
      phase: Phase,
      profile: UserProfile | null = null,
      error: string | null = null,
    ) {
      if (active) setState({ user, profile, phase, error });
    }

    async function subscribe() {
      try {
        const { auth, db } = await import('@/lib/firebase');
        if (!active) return;
        stopAuth = onAuthStateChanged(
          auth,
          (user) => {
            if (!active) return;
            stopProfile();
            clearTimeout(timer);
            const current = ++generation;
            if (!user) return publish(null, 'signed-out');
            if (!user.emailVerified) return publish(user, 'verify');

            publish(user, 'loading');
            timer = setTimeout(() => {
              if (current === generation)
                publish(
                  user,
                  'error',
                  null,
                  'Verifikasi akses profil membutuhkan koneksi. Coba lagi.',
                );
            }, 10_000);
            stopProfile = onSnapshot(
              doc(db, 'users', user.uid),
              { includeMetadataChanges: true },
              (snapshot) => {
                if (
                  !active ||
                  current !== generation ||
                  snapshot.metadata.fromCache ||
                  snapshot.metadata.hasPendingWrites
                )
                  return;
                clearTimeout(timer);
                if (!snapshot.exists()) return publish(user, 'onboarding');
                const profile = parseUserProfile(snapshot.data());
                if (!profile)
                  return publish(
                    user,
                    'error',
                    null,
                    'Profil akun tidak sesuai skema LabSync. Hubungi pengelola.',
                  );
                publish(user, profile.accountStatus === 'active' ? 'active' : 'disabled', profile);
              },
              (error) => {
                if (current !== generation) return;
                clearTimeout(timer);
                publish(user, 'error', null, getAuthErrorMessage(error));
              },
            );
          },
          (error) => {
            generation++;
            stopProfile();
            clearTimeout(timer);
            publish(null, 'error', null, getAuthErrorMessage(error));
          },
        );
      } catch (error) {
        publish(null, 'error', null, getAuthErrorMessage(error));
      }
    }
    void subscribe();

    return () => {
      active = false;
      generation++;
      clearTimeout(timer);
      stopAuth();
      stopProfile();
    };
  }, [attempt]);

  function retry() {
    setState((prev) => ({ ...prev, phase: 'loading', profile: null, error: null }));
    setAttempt((prev) => prev + 1);
  }

  return createElement(
    AuthContext.Provider,
    {
      value: {
        ...state,
        role: state.phase === 'active' ? (state.profile?.role ?? null) : null,
        loading: state.phase === 'loading',
        retry,
      },
    },
    children,
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  return context;
}
