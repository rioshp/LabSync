import { Stack, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MOCK_USERS, type Role } from '@/constants/mockData';
import { BrandColors } from '@/constants/theme';

export default function RoleSelectionScreen() {
  const insets = useSafeAreaInsets();
  const [showIntro, setShowIntro] = useState(true);
  const introProgress = useRef(new Animated.Value(0)).current;
  const [role, setRole] = useState<Role | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const users = MOCK_USERS.filter((user) => user.peran === role);
  const selectedUser = users.find((user) => user.id === userId);

  useEffect(() => {
    introProgress.setValue(0);
    const animation = Animated.timing(introProgress, {
      toValue: 1,
      duration: 950,
      delay: 550,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setShowIntro(false);
    });
    return () => animation.stop();
  }, [introProgress]);

  function selectRole(nextRole: Role) {
    if (nextRole !== role) {
      setRole(nextRole);
      setUserId(null);
    }
  }

  function enterApp() {
    if (!role || !selectedUser) return;

    router.push({
      pathname: '/jadwal',
      params: { userId: selectedUser.id, role },
    });
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.View
        style={[styles.page, { opacity: introProgress }]}
        pointerEvents={showIntro ? 'none' : 'auto'}
        accessibilityElementsHidden={showIntro}
        importantForAccessibility={showIntro ? 'no-hide-descendants' : 'auto'}>
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.background}>
          <View style={styles.backgroundTop} />
          <View style={styles.backgroundSide} />
          <View style={styles.backgroundBottom} />
          <View style={styles.backgroundCorner} />
          <View style={styles.backgroundMiddle} />
          <View style={styles.backgroundTopStep} />
          <View style={styles.backgroundTopTile} />
          <View style={styles.backgroundLeftTile} />
          <View style={styles.backgroundBottomStep} />
          <View style={styles.backgroundBottomTile} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 78, paddingBottom: insets.bottom + 32 },
          ]}>
          <View style={styles.hero}>
            <Text accessibilityRole="header" style={styles.title}>Halo,{'\n'}selamat datang.</Text>
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Peran</Text>
            <View style={styles.roleList}>
              {(['asisten', 'praktikan'] as const).map((option) => {
                const selected = role === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => selectRole(option)}
                    style={({ pressed }) => [
                      styles.option,
                      styles.roleOption,
                      selected && styles.selectedOption,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.optionContent}>
                      <Text style={styles.optionTitle}>
                        {option === 'asisten' ? 'Asisten' : 'Praktikan'}
                      </Text>
                    </View>
                    <View style={[styles.radio, selected && styles.selectedRadio]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Identitas</Text>
            {role && users.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.optionTitle}>Belum ada identitas</Text>
                <Text style={styles.description}>
                  Silakan pilih peran lainnya.
                </Text>
              </View>
            ) : (
              <View style={styles.identityList}>
                {users.map((user) => {
                  const selected = user.id === selectedUser?.id;
                  return (
                    <Pressable
                      key={user.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`${user.nama}, NIM ${user.nim}`}
                      accessibilityState={{ checked: selected }}
                      onPress={() => setUserId(user.id)}
                      style={({ pressed }) => [
                        styles.option,
                        selected && styles.selectedOption,
                        pressed && styles.pressed,
                      ]}>
                      <View style={styles.optionContent}>
                        <Text style={styles.optionTitle}>{user.nama}</Text>
                        <Text style={styles.description}>NIM {user.nim}</Text>
                      </View>
                      <View style={[styles.radio, selected && styles.selectedRadio]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Membuka daftar jadwal praktikum"
              accessibilityState={{ disabled: !selectedUser }}
              disabled={!selectedUser}
              onPress={enterApp}
              style={({ pressed }) => [
                styles.submit,
                !selectedUser && styles.disabledSubmit,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.submitText}>Masuk</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
      {showIntro && (
        <Animated.View
          style={[
            styles.introScreen,
            { opacity: introProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
          ]}
          accessibilityLabel="Memuat presensi praktikum"
          accessibilityRole="progressbar">
          <View style={styles.introMark}>
            {[0, 1, 2, 3].map((block) => (
              <Animated.View
                key={block}
                style={[
                  styles.introBlock,
                  block === 1 && styles.introBlockLight,
                  block === 2 && styles.introBlockSoft,
                  {
                    transform: [
                      {
                        translateX: introProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, block % 2 === 0 ? -52 : 52],
                        }),
                      },
                      {
                        translateY: introProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, block < 2 ? -52 : 52],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BrandColors.paper,
  },
  page: {
    flex: 1,
  },
  introScreen: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.paper,
  },
  introMark: {
    width: 100,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  introBlock: {
    width: 46,
    height: 46,
    backgroundColor: BrandColors.forest,
  },
  introBlockLight: {
    backgroundColor: BrandColors.sageLight,
  },
  introBlockSoft: {
    backgroundColor: BrandColors.forestSoft,
  },
  background: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  backgroundTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 112,
    height: 168,
    backgroundColor: BrandColors.sageLight,
    opacity: 0.85,
  },
  backgroundSide: {
    position: 'absolute',
    top: 176,
    right: 0,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forestSoft,
    opacity: 0.12,
  },
  backgroundBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 112,
    height: 168,
    backgroundColor: BrandColors.sageLight,
    opacity: 0.75,
  },
  backgroundCorner: {
    position: 'absolute',
    bottom: 176,
    left: 0,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forestSoft,
    opacity: 0.12,
  },
  backgroundMiddle: {
    position: 'absolute',
    top: '48%',
    right: 0,
    width: 48,
    height: 104,
    backgroundColor: BrandColors.sageLight,
    opacity: 0.7,
  },
  backgroundTopStep: {
    position: 'absolute',
    top: 0,
    right: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forest,
    opacity: 0.1,
  },
  backgroundTopTile: {
    position: 'absolute',
    top: 56,
    right: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.softGreen,
    opacity: 0.85,
  },
  backgroundLeftTile: {
    position: 'absolute',
    top: '47%',
    left: 0,
    width: 32,
    height: 48,
    backgroundColor: BrandColors.sage,
    opacity: 0.18,
  },
  backgroundBottomStep: {
    position: 'absolute',
    bottom: 0,
    left: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forest,
    opacity: 0.1,
  },
  backgroundBottomTile: {
    position: 'absolute',
    bottom: 56,
    left: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.softGreen,
    opacity: 0.85,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 24,
    gap: 28,
  },
  hero: {
    gap: 16,
    paddingBottom: 8,
  },
  title: {
    color: BrandColors.forestDeep,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: BrandColors.forestDeep,
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: BrandColors.forestSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  roleList: {
    flexDirection: 'row',
    gap: 12,
  },
  identityList: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 68,
    padding: 14,
    borderWidth: 2,
    borderRadius: 14,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  roleOption: {
    flex: 1,
  },
  selectedOption: {
    borderColor: BrandColors.forest,
    backgroundColor: BrandColors.softGreen,
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    color: BrandColors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BrandColors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedRadio: {
    borderColor: BrandColors.forest,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BrandColors.forest,
  },
  emptyState: {
    padding: 18,
    gap: 6,
    borderLeftWidth: 4,
    borderColor: BrandColors.forestSoft,
    backgroundColor: BrandColors.softGreen,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 4,
  },
  submit: {
    minHeight: 56,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.forest,
  },
  disabledSubmit: {
    backgroundColor: BrandColors.muted,
  },
  submitText: {
    color: BrandColors.paper,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
