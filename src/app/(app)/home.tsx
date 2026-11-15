import { useState } from 'react';
import { Text } from 'react-native';

import { AuthButton, AuthError, AuthScreen, authStyles } from '@/components/auth-screen';
import { useAuth } from '@/hooks/useAuth';
import { getAuthErrorMessage, logout } from '@/lib/auth';

export default function HomeScreen() {
  const { profile, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await logout();
    } catch (error) {
      setError(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen title={`Halo, ${profile?.name ?? ''}.`}
      description={profile?.role === 'asisten' ? 'Selamat datang, Asisten.' : 'Selamat datang, Praktikan.'}>
      <Text style={authStyles.label}>{user?.email}</Text>
      {profile?.role === 'praktikan' && <Text style={authStyles.label}>NIM {profile.nim}</Text>}
      <AuthError message={error} />
      <AuthButton title="Keluar" onPress={handleLogout} busy={busy} />
    </AuthScreen>
  );
}
