import type { AuthCredential } from '@react-native-firebase/auth';
import { Link, Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AccountSetup } from '@/components/account-setup';
import { AuthButton, AuthError, AuthField, AuthScreen, authStyles } from '@/components/auth-screen';
import { AuthSessionStatus } from '@/components/auth-session-status';
import { DemoAccountPicker } from '@/components/demo-account-picker';
import { BrandColors } from '@/constants/theme';
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
      description={resetting ? 'Masukkan email akun praktikum kamu.' : undefined}
      headerAction={
        !resetting && (
          <DemoAccountPicker
            disabled={!!busy}
            onSelect={(account) => {
              pendingGoogle.current = null;
              setEmail(account.email);
              setPassword(account.password);
              setError(null);
              setNotice('');
            }}
          />
        )
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
          <View>
            <AuthField
              label="Password"
              value={password}
              onChangeText={setPassword}
              passwordToggle
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => submit('email')}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!!busy}
              onPress={() => {
                setMode('reset');
                setError(null);
                setNotice('');
              }}
              style={styles.forgotPassword}
            >
              <Text style={styles.smallLink}>Lupa password?</Text>
            </Pressable>
          </View>
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
        {resetting ? (
          <Text
            accessibilityRole="button"
            style={authStyles.link}
            onPress={() => {
              if (busy) return;
              setMode('login');
              setError(null);
              setNotice('');
            }}
          >
            Kembali ke masuk
          </Text>
        ) : (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>atau</Text>
              <View style={styles.dividerLine} />
            </View>
            <AuthButton
              title="Masuk dengan Google"
              variant="google"
              onPress={() => submit('google')}
              busy={busy === 'google'}
              disabled={!!busy}
            />
            {!busy && (
              <View style={styles.footer}>
                <Link href="/register" style={[styles.smallLink, styles.footerLink]}>
                  <Text style={styles.footerPrompt}>Belum punya akun? </Text>Daftar
                </Link>
              </View>
            )}
          </>
        )}
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  forgotPassword: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
  },
  smallLink: {
    color: BrandColors.forest,
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: BrandColors.line,
  },
  dividerText: {
    color: BrandColors.forestSoft,
    fontSize: 13,
  },
  footer: {
    alignItems: 'center',
  },
  footerLink: {
    paddingVertical: 12,
    textAlign: 'center',
  },
  footerPrompt: {
    color: BrandColors.forestSoft,
    fontWeight: '400',
  },
});
