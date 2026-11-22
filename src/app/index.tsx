import type { AuthCredential } from '@react-native-firebase/auth';
import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AccountSetup } from '@/components/account-setup';
import { AuthButton, AuthError, AuthField, AuthScreen, authStyles } from '@/components/auth-screen';
import { AuthSessionStatus } from '@/components/auth-session-status';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import {
  getAuthErrorMessage,
  getGoogleCredential,
  login,
  loginWithGoogle,
  resetPassword,
} from '@/lib/auth';
import { firebaseErrorCode } from '@/lib/firebase-error';

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
  return (
    <AuthScreen
      key={mode}
      header={resetting ? 'clean' : 'wave'}
      onBack={resetting ? returnToLogin : undefined}
      showHatch={resetting}
      title={resetting ? 'Atur ulang password.' : 'Halo lagi,\nsiap praktikum?'}
      description={
        resetting
          ? 'Masukkan email akun praktikum untuk menerima tautan reset.'
          : 'Masuk untuk lihat jadwal dan presensi.'
      }
    >
      {!resetting ? (
        <View style={styles.segmentWrap} accessibilityRole="tablist">
          <View style={[styles.segmentItem, styles.segmentActive]}>
            <Text style={styles.segmentActiveText}>Masuk</Text>
          </View>
          <Pressable
            accessibilityRole="tab"
            disabled={!!busy}
            onPress={() => router.replace('/register')}
            style={styles.segmentItem}
          >
            <Text style={styles.segmentIdleText}>Daftar</Text>
          </Pressable>
        </View>
      ) : null}

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
              <Pressable
                accessibilityRole="button"
                disabled={!!busy}
                onPress={() => {
                  setMode('reset');
                  setError(null);
                  setNotice('');
                }}
              >
                <Text style={styles.forgotLink}>Lupa password?</Text>
              </Pressable>
            }
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            passwordToggle
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
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
          title={resetting ? 'Kirim tautan reset' : 'Masuk'}
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
        ) : (
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
        )}
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: BrandColors.soft,
    borderRadius: 999,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: BrandColors.ink,
  },
  segmentActiveText: {
    color: BrandColors.paper,
    fontSize: 13,
    fontWeight: '800',
  },
  segmentIdleText: {
    color: BrandColors.muted,
    fontSize: 13,
    fontWeight: '700',
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
