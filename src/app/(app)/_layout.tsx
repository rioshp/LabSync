import { Stack } from 'expo-router';

import { AssistantClassesProvider } from '@/features/academic/useAcademic';
import { useAuth } from '@/hooks/useAuth';

export default function AppLayout() {
  const { user, role } = useAuth();

  return (
    <AssistantClassesProvider uid={role === 'asisten' ? user?.uid : undefined}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Protected guard={role === 'asisten'}>
          <Stack.Screen name="asisten/kelas" />
          <Stack.Screen name="asisten/sesi" />
        </Stack.Protected>
        <Stack.Protected guard={role === 'praktikan'}>
          <Stack.Screen name="praktikan/presensi" />
          <Stack.Screen name="praktikan/ajukan-izin" />
          <Stack.Screen name="praktikan/ulasan" />
        </Stack.Protected>
      </Stack>
    </AssistantClassesProvider>
  );
}
