import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { LogoutButton } from '@/components/logout-button';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

export const unstable_settings = { anchor: 'jadwal' };

export default function AppLayout() {
  const { role } = useAuth();
  return (
    <Tabs backBehavior="history" screenOptions={{
      headerStyle: { backgroundColor: BrandColors.paper },
      headerTintColor: BrandColors.forestDeep,
      headerTitleStyle: { fontWeight: '700' },
      headerShadowVisible: false,
      headerRight: () => <LogoutButton />,
      tabBarStyle: { backgroundColor: BrandColors.paper, borderTopColor: BrandColors.line },
      tabBarActiveTintColor: BrandColors.forest,
      tabBarInactiveTintColor: BrandColors.muted,
      tabBarActiveBackgroundColor: BrandColors.softGreen,
    }}>
      <Tabs.Screen name="jadwal" options={{
        title: role === 'asisten' ? 'Jadwal' : 'Jadwal Saya',
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>▦</Text>,
      }} />
      <Tabs.Protected guard={role === 'asisten'}>
        <Tabs.Screen name="asisten/praktikum" options={{
          title: 'Praktikum',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>▤</Text>,
        }} />
        <Tabs.Screen name="asisten/izin" options={{
          title: 'Daftar Izin',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>☷</Text>,
        }} />
        <Tabs.Screen name="asisten/sesi" options={{ title: 'Kelola Sesi', href: null, tabBarStyle: { display: 'none' } }} />
      </Tabs.Protected>
      <Tabs.Protected guard={role === 'praktikan'}>
        <Tabs.Screen name="praktikan/riwayat" options={{
          title: 'Riwayat Saya',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>↺</Text>,
        }} />
        <Tabs.Screen name="praktikan/presensi" options={{ title: 'Presensi', href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="praktikan/ajukan-izin" options={{ title: 'Ajukan Izin', href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="praktikan/ulasan" options={{ title: 'Ulasan', href: null, tabBarStyle: { display: 'none' } }} />
      </Tabs.Protected>
    </Tabs>
  );
}
