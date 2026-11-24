import { Stack } from 'expo-router';

import { AssistantClassesProvider } from '@/features/academic/useAcademic';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { user, phase, role } = useAuth();
  useNotifications();
  const signedIn = phase === 'active';

  return (
    <AssistantClassesProvider uid={signedIn && role === 'asisten' ? user?.uid : undefined}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Protected guard={!user}>
          <Stack.Screen name="register" options={{ animation: 'none' }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Protected guard={role === 'asisten'}>
            <Stack.Screen name="asisten/kelas" />
            <Stack.Screen name="asisten/lab" />
            <Stack.Screen name="asisten/sesi" />
          </Stack.Protected>
          <Stack.Protected guard={role === 'praktikan'}>
            <Stack.Screen name="praktikan/kelas-detail" />
            <Stack.Screen name="praktikan/presensi" />
            <Stack.Screen name="praktikan/ajukan-izin" />
            <Stack.Screen name="praktikan/ulasan" />
          </Stack.Protected>
        </Stack.Protected>
      </Stack>
    </AssistantClassesProvider>
  );
}
