import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { AuthButton, AuthError, AuthScreen } from '@/components/auth-screen';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { getAuthErrorMessage, logout } from '@/lib/auth';

export function AuthSessionStatus({ message }: { message?: string | null }) {
  const { loading, error, retry } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError(null);
    try {
      await logout();
    } catch (error) {
      setLogoutError(getAuthErrorMessage(error));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <AuthScreen title={loading ? 'Memuat akun.' : 'Profil belum siap.'}
      description="Kami memeriksa akun dan profil kamu.">
      {loading ? <ActivityIndicator size="large" color={BrandColors.forest} /> : (
        <>
          <AuthError message={logoutError ?? message ?? error} />
          <AuthButton title="Coba lagi" onPress={retry} disabled={signingOut} />
          <AuthButton title="Kembali ke login" onPress={handleLogout} busy={signingOut} />
        </>
      )}
    </AuthScreen>
  );
}

