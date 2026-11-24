import type { AuthCredential } from '@react-native-firebase/auth';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { AccountSetup } from '@/components/account-setup';
import {
  AuthButton,
  AuthError,
  AuthField,
  AuthScreen,
  AuthTabs,
  authStyles,
} from '@/components/auth-screen';
import { AuthSessionStatus } from '@/components/auth-session-status';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  getAuthErrorMessage,
  getGoogleCredential,
  login,
  loginWithGoogle,
  resetPassword,
  register,
} from '@/lib/auth';
import { firebaseErrorCode } from '@/lib/firebase-error';

export function AuthEntry({ initialMode = 'login' }: { initialMode?: 'login' | 'register' }) {
  const { user, phase, error: sessionError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [opacity] = useState(() => new Animated.Value(1));
  const switching = useRef(false);
  const [transitioning, setTransitioning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const pendingGoogle = useRef<{ credential: AuthCredential; email: string } | null>(null);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 110,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      switching.current = false;
      setTransitioning(false);
    });
    return () => opacity.stopAnimation();
  }, [mode, opacity]);

  function switchMode(next: 'login' | 'register') {
    if (busy || switching.current || mode === next) return;
    switching.current = true;
    setTransitioning(true);
    Animated.timing(opacity, {
      toValue: 0,
      duration: 70,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setError(null);
      setNotice('');
      pendingGoogle.current = null;
      setConfirmPassword('');
      setMode(next);
    });
  }


  async function submit(action: 'email' | 'google') {
    if (busy || switching.current) return;
    setBusy(action);
    setNotice('');
    setError(null);
    try {
      if (mode === 'reset') {
        await resetPassword(email);
        setNotice('Jika alamat terdaftar, tautan reset akan dikirim. Periksa juga folder spam.');
      } else if (mode === 'register') {
        await register(email, password, confirmPassword);
      } else if (action === 'email') {
        const pending = pendingGoogle.current;
        await login(
          email,
          password,
          pending?.email.toLowerCase() === email.trim().toLowerCase()
            ? pending.credential
            : undefined,
        );
        pendingGoogle.current = null;
        setPassword('');
      } else {
        pendingGoogle.current = null;
        const google = await getGoogleCredential();
        if (!google) return;
        try {
          await loginWithGoogle(google.credential);
        } catch (error) {
          if (firebaseErrorCode(error) !== 'account-exists-with-different-credential') throw error;
          pendingGoogle.current = google;
          setEmail(google.email);
          setNotice(
            'Masuk dengan password akun ini untuk menghubungkan Google. Jika sesi Google kedaluwarsa, pilih Google lagi.',
          );
        }
      }
    } catch (error) {
      setError(getAuthErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function returnToLogin() {
    if (busy) return;
    setMode('login');
    setError(null);
    setNotice('');
  }

  if (!busy && phase === 'active') return <Redirect href="/jadwal" />;
  if (!busy && user && (phase === 'verify' || phase === 'onboarding' || phase === 'disabled')) {
    return <AccountSetup key={user.uid + phase} />;
  }
  if (!busy && (phase === 'loading' || user)) return <AuthSessionStatus />;

  const resetting = mode === 'reset';
  const registering = mode === 'register';
  return (
    <AuthScreen
      contentOpacity={opacity}
      header={resetting ? 'clean' : 'wave'}
      onBack={resetting ? returnToLogin : undefined}
      showHatch={resetting}
      title={resetting ? 'Atur ulang password.' : registering ? 'Buat akun baru.' : 'Halo lagi,\nsiap praktikum?'}
      description={
        resetting
          ? 'Masukkan email akun praktikum untuk menerima tautan reset.'
          : registering
            ? 'Gunakan email aktif untuk verifikasi praktikum.'
            : 'Masuk untuk lihat jadwal dan presensi.'
      }
    >
      {!resetting ? <AuthTabs active={registering ? 'register' : 'login'} disabled={!!busy || transitioning} onChange={switchMode} /> : null}

      <View style={authStyles.form}>
        <AuthField
          label="Email"
          icon="mail"
          value={email}
          onChangeText={setEmail}
          placeholder="mahasiswa@kampus.ac.id"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!busy}
        />
        {!resetting ? (
          <AuthField
            label="Password"
            icon="lock"
            labelRight={
              <Animated.View style={{ opacity }}>
              {!registering ? <Pressable
                accessibilityRole="button"
                disabled={!!busy}
                onPress={() => {
                  setMode('reset');
                  setError(null);
                  setNotice('');
                }}
              >
                <Text style={styles.forgotLink}>Lupa password?</Text>
              </Pressable> : null}
              </Animated.View>
            }
            value={password}
            onChangeText={setPassword}
            placeholder={registering ? 'Minimal 6 karakter' : '••••••••'}
            passwordToggle
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={registering ? 'new-password' : 'current-password'}
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={() => submit('email')}
          />
        ) : null}
        <Animated.View style={[styles.changingForm, { opacity }]} pointerEvents={transitioning ? 'none' : 'auto'}>
          {registering ? (
            <AuthField
              label="Konfirmasi password"
              icon="lock"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Ulangi password"
              passwordToggle
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => submit('email')}
            />
          ) : null}
          <AuthError message={error ?? sessionError} />
          {notice ? (
            <View style={styles.noticeBox}>
              <Text accessibilityLiveRegion="polite" style={styles.noticeText}>
                {notice}
              </Text>
            </View>
          ) : null}
          <AuthButton
            title={resetting ? 'Kirim tautan reset' : registering ? 'Daftar' : 'Masuk'}
            onPress={() => submit('email')}
            busy={busy === 'email'}
            disabled={!!busy}
          />
          {resetting ? (
            <AuthButton
              title="Kembali ke masuk"
              variant="soft"
              disabled={!!busy}
              onPress={returnToLogin}
            />
          ) : !registering ? (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>atau</Text>
                <View style={styles.dividerLine} />
              </View>
              <AuthButton
                title="Lanjut dengan Google"
                variant="google"
                onPress={() => submit('google')}
                busy={busy === 'google'}
                disabled={!!busy}
              />
            </>
          ) : null}
        </Animated.View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  changingForm: {
    gap: 12,
    minHeight: 190,
  },
  forgotLink: {
    color: BrandColors.ink,
    fontSize: 11.5,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  noticeBox: {
    backgroundColor: BrandColors.soft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    color: BrandColors.ink,
    fontSize: 13,
    lineHeight: 19,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: BrandColors.line,
  },
  dividerText: {
    color: BrandColors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
});
