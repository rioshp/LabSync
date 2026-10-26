import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MOCK_SESSIONS, MOCK_USERS } from '@/constants/mockData';
import { BrandColors, SessionStatusColors } from '@/constants/theme';

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { userId, role } = useLocalSearchParams<{
    userId?: string | string[];
    role?: string | string[];
  }>();
  const user = MOCK_USERS.find((candidate) => candidate.id === userId && candidate.peran === role);
  const isAssistant = user?.peran === 'asisten';

  function returnToRoleSelection() {
    router.dismissTo('/');
  }

  function openSession(sessionId: string) {
    if (!user) return;

    router.push({
      pathname: isAssistant ? '/asisten-sesi' : '/praktikan-presensi',
      params: { sessionId, userId: user.id, role: user.peran },
    });
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: BrandColors.paper },
        }}
      />
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
        <View style={styles.backgroundRightTile} />
        <View style={styles.backgroundBottomStep} />
        <View style={styles.backgroundBottomTile} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali ke pilihan peran dan identitas"
          onPress={returnToRoleSelection}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <View accessible={false} style={[styles.navigationIcon, styles.backIcon]}>
            <View style={[styles.chevron, styles.chevronBack]} />
          </View>
          <Text style={styles.backText}>Ganti Peran</Text>
        </Pressable>

        <Text accessibilityRole="header" style={styles.title}>Jadwal{'\n'}praktikum.</Text>

        {!user ? (
          <View style={styles.emptyState}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Identitas tidak ditemukan</Text>
            <Text style={styles.description}>
              Kembali melalui tombol Ganti Peran, lalu pilih peran dan identitas yang sesuai.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.identityCard}>
              <Text style={styles.eyebrow}>{isAssistant ? 'ASISTEN' : 'PRAKTIKAN'}</Text>
              <Text style={styles.identityName}>{user.nama}</Text>
              <Text style={styles.description}>NIM {user.nim}</Text>
            </View>

            {!isAssistant && (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Membuka riwayat kehadiran milik Anda"
                onPress={() => router.push({
                  pathname: '/riwayat-praktikan',
                  params: { userId: user.id },
                })}
                style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}>
                <Text style={styles.historyText}>Catatan Kehadiran Saya</Text>
                <View accessible={false} style={[styles.navigationIcon, styles.forwardIcon]}>
                  <View style={styles.chevron} />
                </View>
              </Pressable>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Daftar jadwal</Text>
                <Text style={styles.description}>{MOCK_SESSIONS.length} sesi</Text>
              </View>

              {MOCK_SESSIONS.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text accessibilityRole="header" style={styles.cardTitle}>Belum ada jadwal</Text>
                  <Text style={styles.description}>
                    Jadwal praktikum belum tersedia. Silakan periksa kembali nanti.
                  </Text>
                </View>
              ) : (
                MOCK_SESSIONS.map((session) => {
                  const status = SessionStatusColors[session.status];

                  return (
                    <Pressable
                      key={session.id}
                      accessibilityRole="button"
                      accessibilityHint={isAssistant ? 'Membuka halaman kelola sesi' : 'Membuka detail dan presensi sesi'}
                      onPress={() => openSession(session.id)}
                      style={({ pressed }) => [
                        styles.sessionCard,
                        pressed && styles.pressed,
                      ]}>
                      <View
                        pointerEvents="none"
                        accessible={false}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={styles.brandWatermark}>
                        {[0, 1, 2, 3].map((block) => (
                          <View key={block} style={[
                            styles.brandBlock,
                            block === 1 && styles.splashBlockLight,
                            block === 2 && styles.splashBlockSoft,
                          ]} />
                        ))}
                      </View>
                      <View style={styles.sessionHeader}>
                        <View style={styles.classBadge}>
                          <Text style={styles.classText}>{session.kelas}</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                          <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                        </View>
                      </View>
                      <View style={styles.sessionHeading}>
                        <Text style={styles.cardTitle}>{session.namaPraktikum}</Text>
                        <Text style={styles.description}>{session.modul}</Text>
                      </View>
                      <View style={styles.details}>
                        <View style={styles.detailRow}>
                          <View accessible={false} style={styles.detailIcon}>
                            <View style={styles.clockIcon}>
                              <View style={styles.clockMinute} />
                              <View style={styles.clockHour} />
                            </View>
                          </View>
                          <Text accessibilityLabel={`Waktu: ${session.waktu}`} style={styles.detailValue}>{session.waktu}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <View accessible={false} style={styles.detailIcon}>
                            <View style={styles.locationIcon}>
                              <View style={styles.locationDot} />
                            </View>
                          </View>
                          <Text accessibilityLabel={`Ruangan: ${session.ruangan}`} style={styles.detailValue}>{session.ruangan}</Text>
                        </View>
                      </View>
                      <View style={styles.cardFooter}>
                        <Text style={styles.actionText}>
                          {isAssistant ? 'Kelola sesi' : 'Lihat detail sesi'}
                        </Text>
                        <View accessible={false} style={[styles.navigationIcon, styles.forwardIcon]}>
                          <View style={styles.chevron} />
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BrandColors.paper,
  },
  background: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  backgroundTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 112,
    height: 168,
    backgroundColor: BrandColors.sageLight,
    opacity: 0.85,
  },
  backgroundSide: {
    position: 'absolute',
    top: 176,
    left: 0,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forestSoft,
    opacity: 0.12,
  },
  backgroundBottom: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 112,
    height: 168,
    backgroundColor: BrandColors.sageLight,
    opacity: 0.75,
  },
  backgroundCorner: {
    position: 'absolute',
    bottom: 176,
    right: 0,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forestSoft,
    opacity: 0.12,
  },
  backgroundMiddle: {
    position: 'absolute',
    top: '48%',
    left: 0,
    width: 48,
    height: 104,
    backgroundColor: BrandColors.sageLight,
    opacity: 0.7,
  },
  backgroundTopStep: {
    position: 'absolute',
    top: 0,
    left: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forest,
    opacity: 0.1,
  },
  backgroundTopTile: {
    position: 'absolute',
    top: 56,
    left: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.softGreen,
    opacity: 0.85,
  },
  backgroundRightTile: {
    position: 'absolute',
    top: '47%',
    right: 0,
    width: 32,
    height: 48,
    backgroundColor: BrandColors.sage,
    opacity: 0.18,
  },
  backgroundBottomStep: {
    position: 'absolute',
    bottom: 0,
    right: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forest,
    opacity: 0.1,
  },
  backgroundBottomTile: {
    position: 'absolute',
    bottom: 56,
    right: 120,
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
    gap: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    gap: 10,
    paddingRight: 16,
    borderRadius: 24,
  },
  navigationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BrandColors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    paddingLeft: 4,
    backgroundColor: BrandColors.forest,
  },
  chevron: {
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: BrandColors.forest,
    transform: [{ rotate: '45deg' }],
  },
  chevronBack: {
    transform: [{ rotate: '-135deg' }],
    borderColor: BrandColors.paper,
  },
  forwardIcon: {
    paddingRight: 4,
  },
  backText: {
    color: BrandColors.forest,
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: BrandColors.forestDeep,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
  },
  description: {
    color: BrandColors.forestSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  identityCard: {
    padding: 18,
    gap: 6,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  eyebrow: {
    color: BrandColors.forestSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  identityName: {
    color: BrandColors.forestDeep,
    fontSize: 20,
    fontWeight: '700',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderRadius: 14,
    backgroundColor: BrandColors.forest,
  },
  historyText: {
    flex: 1,
    color: BrandColors.paper,
    fontSize: 16,
    fontWeight: '700',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    color: BrandColors.forestDeep,
    fontSize: 16,
    fontWeight: '700',
  },
  sessionCard: {
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  splashBlockLight: {
    backgroundColor: BrandColors.sageLight,
  },
  brandWatermark: {
    position: 'absolute',
    right: -10,
    bottom: 48,
    width: 96,
    height: 96,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    opacity: 0.08,
  },
  brandBlock: {
    width: 44,
    height: 44,
    borderRadius: 3,
    backgroundColor: BrandColors.forest,
  },
  splashBlockSoft: {
    backgroundColor: BrandColors.forestSoft,
  },
  sessionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  classBadge: {
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: BrandColors.forest,
  },
  classText: {
    color: BrandColors.paper,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sessionHeading: {
    gap: 4,
  },
  cardTitle: {
    color: BrandColors.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  details: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
  },
  detailIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockIcon: {
    width: 16,
    height: 16,
    borderWidth: 1.5,
    borderRadius: 8,
    borderColor: BrandColors.forestSoft,
  },
  clockMinute: {
    position: 'absolute',
    top: 2,
    left: 5.5,
    width: 1.5,
    height: 5,
    borderRadius: 1,
    backgroundColor: BrandColors.forestSoft,
  },
  clockHour: {
    position: 'absolute',
    top: 6,
    left: 5.5,
    width: 4,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: BrandColors.forestSoft,
  },
  locationIcon: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderColor: BrandColors.forestSoft,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 1,
    transform: [{ rotate: '45deg' }],
    marginTop: -4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: BrandColors.forestSoft,
  },
  detailValue: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
    color: BrandColors.ink,
    fontSize: 13,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingTop: 4,
  },
  actionText: {
    flex: 1,
    color: BrandColors.forest,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    padding: 18,
    gap: 6,
    borderLeftWidth: 4,
    borderColor: BrandColors.forestSoft,
    backgroundColor: BrandColors.softGreen,
  },
  pressed: {
    opacity: 0.75,
  },
});
