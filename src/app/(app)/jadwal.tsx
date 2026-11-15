import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton } from '@/components/auth-screen';
import { BrandColors, SessionStatusColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useSchedule } from '@/hooks/useSchedule';
import type { Session } from '@/types/session';

const statusColors = {
  upcoming: SessionStatusColors.BELUM_DIBUKA,
  open: SessionStatusColors.DIBUKA,
  closed: SessionStatusColors.DITUTUP,
};

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { profile, role } = useAuth();
  const { sessions, loading, error, retry } = useSchedule();
  const isAssistant = role === 'asisten';

  function openSession(session: Session) {
    router.push({
      pathname: isAssistant ? '/(app)/asisten/sesi' : '/(app)/praktikan/presensi',
      params: { sessionId: session.id },
    });
  }

  return (
    <View style={styles.screen}>
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

      <ScrollView style={styles.scroll} contentContainerStyle={[
        styles.content, { paddingTop: 16, paddingBottom: insets.bottom + 32 },
      ]}>
        <Text accessibilityRole="header" style={styles.title}>Jadwal{'\n'}praktikum.</Text>
        <View style={styles.identityCard}>
          <Text style={styles.eyebrow}>{isAssistant ? 'ASISTEN' : 'PRAKTIKAN'}</Text>
          <Text style={styles.identityName}>{profile?.name}</Text>
          {profile?.role === 'praktikan' && <Text style={styles.description}>NIM {profile.nim}</Text>}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Daftar jadwal</Text>
            {!loading && !error && <Text style={styles.description}>{sessions.length} sesi</Text>}
          </View>

          {loading ? (
            <View style={styles.emptyState} accessibilityRole="progressbar" accessibilityLabel="Memuat jadwal">
              <ActivityIndicator color={BrandColors.forest} />
              <Text style={styles.description}>Memuat jadwal praktikum...</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Text accessibilityRole="alert" style={styles.cardTitle}>Jadwal belum dapat ditampilkan</Text>
              <Text style={styles.description}>{error}</Text>
              <AuthButton title="Coba lagi" onPress={retry} />
            </View>
          ) : sessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text accessibilityRole="header" style={styles.cardTitle}>Belum ada jadwal</Text>
              <Text style={styles.description}>Jadwal praktikum belum tersedia untuk akun ini.</Text>
            </View>
          ) : sessions.map((session) => {
            const status = statusColors[session.status];
            const timeLabel = `${session.date} · ${session.startTime} - ${session.endTime} WIB`;
            return (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                accessibilityHint={isAssistant ? 'Membuka halaman kelola sesi' : 'Membuka detail dan presensi sesi'}
                onPress={() => openSession(session)}
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
                    <Text style={styles.classText}>{session.className}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                  </View>
                </View>
                <View style={styles.sessionHeading}>
                  <Text style={styles.cardTitle}>{session.practicum}</Text>
                  <Text style={styles.description}>{session.module}</Text>
                </View>
                <View style={styles.details}>
                  <View style={styles.detailRow}>
                    <View accessible={false} style={styles.detailIcon}>
                      <View style={styles.clockIcon}>
                        <View style={styles.clockMinute} />
                        <View style={styles.clockHour} />
                      </View>
                    </View>
                    <Text accessibilityLabel={`Waktu: ${timeLabel}`} style={styles.detailValue}>{timeLabel}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <View accessible={false} style={styles.detailIcon}>
                      <View style={styles.locationIcon}>
                        <View style={styles.locationDot} />
                      </View>
                    </View>
                    <Text accessibilityLabel={`Ruangan: ${session.room}`} style={styles.detailValue}>{session.room}</Text>
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
          })}
        </View>
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
  navigationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BrandColors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: BrandColors.forest,
    transform: [{ rotate: '45deg' }],
  },
  forwardIcon: {
    paddingRight: 4,
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
