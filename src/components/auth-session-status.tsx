import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

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
    <AuthScreen
      header="clean"
      dangerBadge={!loading}
      title={loading ? 'Memuat akun.' : 'Profil belum siap.'}
      description="Kami memeriksa akun dan profil kamu."
    >
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={BrandColors.ink} />
        </View>
      ) : (
        <View style={styles.actions}>
          <AuthError message={logoutError ?? message ?? error} />
          <AuthButton title="Coba lagi" onPress={retry} disabled={signingOut} />
          <AuthButton
            title="Kembali ke login"
            variant="soft"
            onPress={handleLogout}
            busy={signingOut}
          />
        </View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  actions: {
    gap: 12,
  },
});
