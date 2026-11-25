import type { ComponentProps } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';

import { CsGraphLogo, ScreenBackdrop } from '@/components/labsync-brand';
import { LogoutButton } from '@/components/logout-button';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

function HeaderBackdrop({ variant }: { variant: 'waves' | 'topo' | 'blobs' | 'geometric' }) {
  return (
    <View style={styles.headerBg}>
      <ScreenBackdrop variant={variant} />
    </View>
  );
}

function HeaderTitle({ title }: { title: string }) {
  return (
    <View style={styles.headerTitleWrap}>
      <CsGraphLogo size={26} />
      <Text numberOfLines={1} style={styles.headerTitleText}>
        {title}
      </Text>
    </View>
  );
}

function TabIcon({
  ios,
  android,
  color,
  size = 18,
}: {
  ios: SFSymbol;
  android: string;
  color: ColorValue;
  size?: number;
}) {
  return (
    <SymbolView name={{ ios, android, web: android } as never} tintColor={color} size={size} />
  );
}

const TAB_LABELS: Record<string, string> = {
  jadwal: 'Jadwal',
  peta: 'Peta',
  'asisten/praktikum': 'Praktikum',
  'asisten/izin': 'Izin',
  'praktikan/kelas': 'Kelas',
  profil: 'Profil',
};

type CustomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function FloatingPillTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
}: CustomTabBarProps) {
  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarOuter, { bottom: Math.max(insets.bottom + 8, 18) }]}
    >
      <View style={styles.tabBarCapsule}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label =
            TAB_LABELS[route.name] ??
            (typeof options.title === 'string' ? options.title : route.name);

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };

          const onLongPress = () => {
            emitter.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const color = isFocused ? BrandColors.paper : BrandColors.muted;
          const icon = options.tabBarIcon?.({
            focused: isFocused,
            color,
            size: isFocused ? 17 : 18,
          });

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                isFocused ? styles.tabActivePill : styles.tabIdleItem,
                pressed && styles.tabPressed,
              ]}
            >
              {icon}
              <Text
                numberOfLines={1}
                style={isFocused ? styles.tabActiveLabel : styles.tabIdleLabel}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppTabs() {
  const { role } = useAuth();
  const pathname = usePathname();
  const isProfile = pathname === '/profil';

  return (
    <>
      <StatusBar style={isProfile ? 'light' : 'dark'} />
      <Tabs
        backBehavior="history"
        tabBar={(props) => <FloatingPillTabBar {...props} />}
        screenOptions={{
          headerStyle: { backgroundColor: BrandColors.pageBackground },
          headerTintColor: BrandColors.ink,
          headerTitleAlign: 'left',
          headerShadowVisible: false,
          headerRight: () => <LogoutButton />,
        }}
      >
        <Tabs.Screen
          name="jadwal"
          options={{
            title: role === 'asisten' ? 'Jadwal' : 'Jadwal Saya',
            headerBackground: () => <HeaderBackdrop variant="waves" />,
            headerTitle: () => (
              <HeaderTitle title={role === 'asisten' ? 'Jadwal praktikum' : 'Jadwal saya'} />
            ),
            tabBarIcon: ({ color, size }) => (
              <TabIcon ios="calendar" android="calendar_today" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="peta"
          options={{
            title: 'Peta Lab',
            headerTitle: () => <HeaderTitle title="Peta laboratorium" />,
            tabBarIcon: ({ color, size }) => (
              <TabIcon ios="map" android="map" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Protected guard={role === 'asisten'}>
          <Tabs.Screen
            name="asisten/praktikum"
            options={{
              title: 'Praktikum',
              headerBackground: () => <HeaderBackdrop variant="topo" />,
              headerTitle: () => <HeaderTitle title="Kelas praktikum" />,
              tabBarIcon: ({ color, size }) => (
                <TabIcon ios="square.grid.2x2" android="grid_view" color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="asisten/izin"
            options={{
              title: 'Daftar Izin',
              headerBackground: () => <HeaderBackdrop variant="geometric" />,
              headerTitle: () => <HeaderTitle title="Daftar izin" />,
              tabBarIcon: ({ color, size }) => (
                <TabIcon ios="doc.text" android="description" color={color} size={size} />
              ),
            }}
          />
        </Tabs.Protected>
        <Tabs.Protected guard={role === 'praktikan'}>
          <Tabs.Screen
            name="praktikan/kelas"
            options={{
              title: 'Kelas Saya',
              headerBackground: () => <HeaderBackdrop variant="topo" />,
              headerTitle: () => <HeaderTitle title="Kelas saya" />,
              tabBarIcon: ({ color, size }) => (
                <TabIcon ios="square.grid.2x2" android="grid_view" color={color} size={size} />
              ),
            }}
          />
        </Tabs.Protected>
        <Tabs.Screen
          name="profil"
          options={{
            title: 'Profil',
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <TabIcon ios="person.circle" android="account_circle" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  headerBg: {
    flex: 1,
    backgroundColor: BrandColors.pageBackground,
    overflow: 'hidden',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headerTitleText: {
    color: BrandColors.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tabBarOuter: {
    position: 'absolute',
    left: 14,
    right: 14,
    alignItems: 'center',
  },
  tabBarCapsule: {
    width: '100%',
    maxWidth: 460,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: BrandColors.paper,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
  tabActivePill: {
    height: 44,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: BrandColors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabActiveLabel: {
    color: BrandColors.paper,
    fontSize: 12,
    fontWeight: '800',
  },
  tabIdleItem: {
    minWidth: 52,
    height: 44,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabIdleLabel: {
    color: BrandColors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  tabPressed: {
    opacity: 0.78,
  },
});
