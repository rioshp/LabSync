import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthButton, AuthError, AuthField, AuthScreen, authStyles } from '@/components/auth-screen';
import { AuthSessionStatus } from '@/components/auth-session-status';
import { useAuth } from '@/hooks/useAuth';
import { getAuthErrorMessage, login } from '@/lib/auth';

export default function LoginScreen() {
  const { user, profile, loading, error: sessionError, retry } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (error) {
      setError(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!submitting && !loading && user && profile) return <Redirect href="/home" />;
  if (!submitting && (loading || user)) return <AuthSessionStatus />;

  return (
    <AuthScreen intro title={'Halo,\nselamat datang.'} description="Masuk untuk mengakses kegiatan praktikum kamu.">
      <View style={authStyles.form}>
        <AuthField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!submitting} />
        <AuthField label="Password" value={password} onChangeText={setPassword} secureTextEntry
          autoCapitalize="none" autoCorrect={false} autoComplete="current-password" editable={!submitting}
          returnKeyType="go" onSubmitEditing={submit} />
        <AuthError message={error ?? sessionError} />
        <AuthButton title="Masuk" onPress={submit} busy={submitting} />
        {sessionError && <AuthButton title="Periksa akun lagi" onPress={retry} disabled={submitting} />}
      </View>
      {!submitting && <Link href="/register" style={authStyles.link}>Belum punya akun? Daftar</Link>}
    </AuthScreen>
  );
}
