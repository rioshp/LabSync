import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton, AuthError, AuthField, AuthScreen, authStyles } from '@/components/auth-screen';
import { BrandColors } from '@/constants/theme';
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
    <AuthScreen
      header="wave"
      title="Buat akun baru."
      description="Gunakan email aktif untuk verifikasi praktikum."
    >
      <View style={styles.segmentWrap} accessibilityRole="tablist">
        <Pressable
          accessibilityRole="tab"
          disabled={busy}
          onPress={() => router.replace('/')}
          style={styles.segmentItem}
        >
          <Text style={styles.segmentIdleText}>Masuk</Text>
        </Pressable>
        <View style={[styles.segmentItem, styles.segmentActive]}>
          <Text style={styles.segmentActiveText}>Daftar</Text>
        </View>
      </View>

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
        <AuthField
          label="Password"
          icon="lock"
          value={password}
          onChangeText={setPassword}
          placeholder="Minimal 6 karakter"
          passwordToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          editable={!busy}
        />
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
          onSubmitEditing={submit}
        />
        <AuthError message={error} />
        <AuthButton title="Daftar" onPress={submit} busy={busy} />
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
});
