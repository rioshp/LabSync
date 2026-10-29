import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MOCK_ATTENDANCES, MOCK_SESSIONS, MOCK_USERS } from '@/constants/mockData';
import { BrandColors } from '@/constants/theme';

export default function RiwayatPraktikanScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId?: string | string[] }>();
  const id = Array.isArray(userId) ? userId[0] : userId;

  const user = MOCK_USERS.find((candidate) => candidate.id === id && candidate.peran === 'praktikan');

  // AttendanceRecord tidak punya userId, jadi dicocokkan lewat NIM.
  const history = user
    ? MOCK_ATTENDANCES.filter((record) => record.nim === user.nim).map((record) => ({
        ...record,
        modul: MOCK_SESSIONS.find((session) => session.id === record.sessionId)?.modul,
      }))
    : [];

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/jadwal');
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
        <View style={styles.backgroundTopStep} />
        <View style={styles.backgroundTopTile} />
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
          accessibilityLabel="Kembali ke daftar jadwal"
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <View accessible={false} style={[styles.navigationIcon, styles.backIcon]}>
            <View style={[styles.chevron, styles.chevronBack]} />
          </View>
          <Text style={styles.backText}>Kembali</Text>
        </Pressable>

        <Text accessibilityRole="header" style={styles.title}>Catatan{'\n'}kehadiran.</Text>

        {!user ? (
          <View style={styles.emptyState}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Identitas tidak ditemukan</Text>
            <Text style={styles.description}>
              Kembali ke daftar jadwal, lalu masuk kembali sebagai praktikan.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.identityCard}>
              <Text style={styles.eyebrow}>PRAKTIKAN</Text>
              <Text style={styles.identityName}>{user.nama}</Text>
              <Text style={styles.description}>NIM {user.nim}</Text>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Riwayat kehadiran</Text>
                <Text style={styles.description}>{history.length} sesi</Text>
              </View>

              {history.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text accessibilityRole="header" style={styles.cardTitle}>Belum ada catatan kehadiran</Text>
                  <Text style={styles.description}>
                    Riwayat akan muncul di sini setelah kamu melakukan presensi pada sesi praktikum
                    yang dibuka asisten.
                  </Text>
                </View>
              ) : (
                history.map((record) => (
                  <View
                    key={record.id}
                    accessible
                    accessibilityLabel={`${record.namaPraktikum}, ${record.kelas}, hadir pukul ${record.waktuHadir}`}
                    style={styles.historyCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.classBadge}>
                        <Text style={styles.classText}>{record.kelas}</Text>
                      </View>
                      <View style={styles.presentBadge}>
                        <Text style={styles.presentText}>Hadir</Text>
                      </View>
                    </View>
                    <View style={styles.cardHeading}>
                      <Text style={styles.cardTitle}>{record.namaPraktikum}</Text>
                      {!!record.modul && <Text style={styles.description}>{record.modul}</Text>}
                    </View>
                    <Text style={styles.detailValue}>Waktu hadir: {record.waktuHadir}</Text>
                  </View>
                ))
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
  historyCard: {
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  cardHeader: {
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
  presentBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: BrandColors.softGreen,
  },
  presentText: {
    color: BrandColors.forest,
    fontSize: 12,
    fontWeight: '700',
  },
  cardHeading: {
    gap: 4,
  },
  cardTitle: {
    color: BrandColors.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  detailValue: {
    color: BrandColors.ink,
    fontSize: 13,
    lineHeight: 20,
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
