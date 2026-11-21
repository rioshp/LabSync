import type { AuthCredential } from '@react-native-firebase/auth';
import { Link, Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { AccountSetup } from '@/components/account-setup';
import { AuthButton, AuthError, AuthField, AuthScreen, authStyles } from '@/components/auth-screen';
import { AuthSessionStatus } from '@/components/auth-session-status';
import { useAuth } from '@/hooks/useAuth';
import {
  authCode,
  getAuthErrorMessage,
  getGoogleCredential,
  login,
  loginWithGoogle,
  resetPassword,
} from '@/lib/auth';

export default function LoginScreen() {
  const { user, phase, error: sessionError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const pendingGoogle = useRef<{ credential: AuthCredential; email: string } | null>(null);

  async function submit(action: 'email' | 'google') {
    if (busy) return;
    setBusy(action);
    setNotice('');
    setError(null);
    try {
      if (mode === 'reset') {
        await resetPassword(email);
        setNotice('Jika alamat terdaftar, tautan reset akan dikirim. Periksa juga folder spam.');
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
          if (authCode(error) !== 'account-exists-with-different-credential') throw error;
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

  if (!busy && phase === 'active') return <Redirect href="/jadwal" />;
  if (!busy && user && (phase === 'verify' || phase === 'onboarding' || phase === 'disabled')) {
    return <AccountSetup key={user.uid + phase} />;
  }
  if (!busy && (phase === 'loading' || user)) return <AuthSessionStatus />;

  const resetting = mode === 'reset';
  return (
    <AuthScreen
      key={mode}
      intro={!resetting}
      title={resetting ? 'Atur ulang password.' : 'Halo,\nselamat datang.'}
      description={
        resetting
          ? 'Masukkan email akun praktikum kamu.'
          : 'Masuk untuk mengakses kegiatan praktikum kamu.'
      }
    >
      <View style={authStyles.form}>
        <AuthField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!busy}
        />
        {!resetting && (
          <AuthField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={() => submit('email')}
          />
        )}
        <AuthError message={error ?? sessionError} />
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={authStyles.label}>
            {notice}
          </Text>
        ) : null}
        <AuthButton
          title={resetting ? 'Kirim tautan reset' : 'Masuk'}
          onPress={() => submit('email')}
          busy={busy === 'email'}
          disabled={!!busy}
        />
        {!resetting && (
          <AuthButton
            title="Lanjut dengan Google"
            onPress={() => submit('google')}
            busy={busy === 'google'}
            disabled={!!busy}
          />
        )}
        <Text
          accessibilityRole="button"
          style={authStyles.link}
          onPress={() => {
            if (busy) return;
            setMode(resetting ? 'login' : 'reset');
            setError(null);
            setNotice('');
          }}
        >
          {resetting ? 'Kembali ke masuk' : 'Lupa password?'}
        </Text>
      </View>
      {!busy && !resetting && (
        <>
          <Link href="/register" style={authStyles.link}>
            Belum punya akun? Daftar
          </Link>
          <Link href="/demo" style={authStyles.link}>
            Coba demo lokal
          </Link>
        </>
      )}
    </AuthScreen>
  );
}
