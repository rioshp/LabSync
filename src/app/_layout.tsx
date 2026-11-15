import { Stack } from 'expo-router';

import { AuthProvider, useAuth } from '@/hooks/useAuth';

export default function RootLayout() {
  return <AuthProvider><RootNavigator /></AuthProvider>;
}

function RootNavigator() {
  const { user, profile, loading } = useAuth();
  const signedIn = !loading && !!user && !!profile;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="register" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="jadwal" />
        <Stack.Screen name="asisten-sesi" />
        <Stack.Screen name="praktikan-presensi" />
        <Stack.Screen name="rekap-asisten" />
        <Stack.Screen name="riwayat-praktikan" />
      </Stack.Protected>
    </Stack>
  );
}
