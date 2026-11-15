import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthButton, AuthError, AuthField, AuthScreen, authStyles } from '@/components/auth-screen';
import { AuthSessionStatus } from '@/components/auth-session-status';
import { useAuth } from '@/hooks/useAuth';
import { getAuthErrorMessage, register } from '@/lib/auth';
import type { Role } from '@/types/user';

export default function RegisterScreen() {
  const { user, loading } = useAuth();
  const [name, setName] = useState('');
  const [nim, setNim] = useState('');
  const [role, setRole] = useState<Role>('praktikan');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await register({ name, nim, role, email, password, confirmPassword });
    } catch (error) {
      setError(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!submitting && (loading || user)) return <AuthSessionStatus message={error} />;

  return (
    <AuthScreen title="Buat akun." description="Daftar untuk mengikuti atau mengelola kegiatan praktikum.">
      <View style={authStyles.form}>
        <AuthField label="Nama" value={name} onChangeText={setName} maxLength={100}
          autoComplete="name" autoCapitalize="words" editable={!submitting} />
        <Text style={authStyles.label}>Peran</Text>
        <View accessibilityRole="radiogroup" style={authStyles.roles}>
          {(['praktikan', 'asisten'] as const).map((option) => (
            <Pressable key={option} accessibilityRole="radio"
              accessibilityState={{ checked: role === option, disabled: submitting }} disabled={submitting}
              onPress={() => setRole(option)} style={[authStyles.role, role === option && authStyles.selectedRole]}>
              <View style={authStyles.roleContent}>
                <Text style={authStyles.label}>{option === 'asisten' ? 'Asisten' : 'Praktikan'}</Text>
              </View>
              <View style={[authStyles.radio, role === option && authStyles.selectedRadio]}>
                {role === option && <View style={authStyles.radioDot} />}
              </View>
            </Pressable>
          ))}
        </View>
        {role === 'praktikan' && <AuthField label="NIM" value={nim} onChangeText={setNim}
          maxLength={30} autoCapitalize="none" autoCorrect={false} editable={!submitting} />}
        <AuthField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!submitting} />
        <AuthField label="Password" value={password} onChangeText={setPassword} secureTextEntry
          autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!submitting} />
        <AuthField label="Konfirmasi password" value={confirmPassword} onChangeText={setConfirmPassword}
          secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
          editable={!submitting} returnKeyType="go" onSubmitEditing={submit} />
        <AuthError message={error} />
        <AuthButton title="Daftar" onPress={submit} busy={submitting} />
      </View>
      {!submitting && <Link href="/" style={authStyles.link}>Sudah punya akun? Masuk</Link>}
    </AuthScreen>
  );
}
