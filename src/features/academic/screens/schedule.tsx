import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton } from '@/components/auth-screen';
import { BrandColors, SessionStatusStyles } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useSchedule } from '@/hooks/useSchedule';
import type { AcademicSession } from '@/features/academic/types';
import { formatSessionRange } from '@/features/academic/time';

import { styles } from './schedule.styles';

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { profile, role } = useAuth();
  const { sessions, loading, error, retry, offline } = useSchedule();
  const isAssistant = role === 'asisten';

  function openSession(session: AcademicSession) {
    router.push({
      pathname: isAssistant ? '/(app)/asisten/sesi' : '/(app)/praktikan/presensi',
      params: { classId: session.classId, sessionId: session.id },
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
          <Text style={styles.identityName}>{profile?.displayName}</Text>
          {profile?.role === 'praktikan' && <Text style={styles.description}>NIM {profile.nim}</Text>}
          {isAssistant && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/asisten/praktikum')}
              style={({ pressed }) => [styles.manageLink, pressed && styles.pressed]}>
              <Text style={styles.manageLinkText}>Kelola praktikum, kelas, dan peserta</Text>
              <Text accessibilityElementsHidden style={styles.manageLinkArrow}>›</Text>
            </Pressable>
          )}
        </View>
        {offline && <Text accessibilityLiveRegion="polite" style={styles.offlineNotice}>Data dari cache dan mungkin belum terbaru. Periksa koneksi internet.</Text>}

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
            const status = SessionStatusStyles[session.status];
            const timeLabel = formatSessionRange(session);
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
