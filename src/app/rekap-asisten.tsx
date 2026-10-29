import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MOCK_ATTENDANCES, MOCK_SESSIONS } from '@/constants/mockData';
import { BrandColors, SessionStatusColors } from '@/constants/theme';

export default function RekapAsistenScreen() {
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  const session = MOCK_SESSIONS.find((candidate) => candidate.id === id);
  const attendances = MOCK_ATTENDANCES.filter((record) => record.sessionId === id);
  const status = session ? SessionStatusColors[session.status] : null;

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
          accessibilityLabel="Kembali ke kelola sesi"
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <View accessible={false} style={[styles.navigationIcon, styles.backIcon]}>
            <View style={[styles.chevron, styles.chevronBack]} />
          </View>
          <Text style={styles.backText}>Kembali</Text>
        </Pressable>

        <Text accessibilityRole="header" style={styles.title}>Rekap{'\n'}presensi.</Text>

        {!session ? (
          <View style={styles.emptyState}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Sesi tidak ditemukan</Text>
            <Text style={styles.description}>
              Kembali ke daftar jadwal, lalu pilih sesi praktikum yang ingin direkap.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <View style={styles.classBadge}>
                  <Text style={styles.classText}>{session.kelas}</Text>
                </View>
                {status && (
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                  </View>
                )}
              </View>
              <View style={styles.sessionHeading}>
                <Text style={styles.cardTitle}>{session.namaPraktikum}</Text>
                <Text style={styles.description}>{session.modul}</Text>
              </View>
              <Text style={styles.detailValue}>{session.waktu}</Text>
              <Text style={styles.detailValue}>{session.ruangan}</Text>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Praktikan hadir</Text>
                <Text style={styles.description}>{attendances.length} orang</Text>
              </View>

              {attendances.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text accessibilityRole="header" style={styles.cardTitle}>Belum ada presensi</Text>
                  <Text style={styles.description}>
                    Belum ada praktikan yang melakukan presensi pada sesi ini. Daftar akan muncul
                    setelah praktikan hadir.
                  </Text>
                </View>
              ) : (
                attendances.map((record, index) => (
                  <View
                    key={record.id}
                    accessible
                    accessibilityLabel={`${index + 1}. ${record.namaPraktikan}, NIM ${record.nim}, hadir pukul ${record.waktuHadir}`}
                    style={styles.attendanceCard}>
                    <View style={styles.numberBadge}>
                      <Text style={styles.numberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.attendanceInfo}>
                      <Text style={styles.cardTitle}>{record.namaPraktikan}</Text>
                      <Text style={styles.description}>NIM {record.nim}</Text>
                    </View>
                    <View style={styles.timeBadge}>
                      <Text style={styles.timeText}>{record.waktuHadir}</Text>
                    </View>
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
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
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
  detailValue: {
    color: BrandColors.ink,
    fontSize: 13,
    lineHeight: 20,
  },
  attendanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  numberBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.forest,
  },
  numberText: {
    color: BrandColors.paper,
    fontSize: 14,
    fontWeight: '700',
  },
  attendanceInfo: {
    flex: 1,
    flexShrink: 1,
  },
  timeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: BrandColors.softGreen,
  },
  timeText: {
    color: BrandColors.forest,
    fontSize: 12,
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
