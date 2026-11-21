import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthButton, AuthError, AuthField, AuthScreen, authStyles } from '@/components/auth-screen';
import { useAuth } from '@/hooks/useAuth';
import { getAuthErrorMessage, register } from '@/lib/auth';

export default function RegisterScreen() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await register(email, password, confirmPassword);
    } catch (error) {
      setError(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!busy && user) return <Redirect href="/" />;

  return (
    <AuthScreen title="Buat akun." description="Daftar untuk mengakses kegiatan praktikum.">
      <View style={authStyles.form}>
        <AuthField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} />
        <AuthField label="Password" value={password} onChangeText={setPassword} secureTextEntry
          autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!busy} />
        <AuthField label="Konfirmasi password" value={confirmPassword} onChangeText={setConfirmPassword}
          secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
          editable={!busy} returnKeyType="go" onSubmitEditing={submit} />
        <AuthError message={error} />
        <AuthButton title="Daftar" onPress={submit} busy={busy} />
      </View>
      {!busy && <Link href="/" style={authStyles.link}>Sudah punya akun? Masuk</Link>}
    </AuthScreen>
  );
}
