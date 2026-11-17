import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton } from '@/components/auth-screen';
import { BrandColors, SessionStatusColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useSchedule } from '@/hooks/useSchedule';
import {
  formatCheckInTime,
  getHistoryErrorMessage,
  subscribeStudentHistory,
} from '@/lib/history';
import type { Attendance } from '@/types/attendance';
import type { Permit, PermitStatus } from '@/types/permit';

type HistorySection = 'attendances' | 'permits';

const PERMIT_STATUS_BADGE: Record<PermitStatus, { bg: string; text: string; label: string }> = {
  pending: {
    bg: SessionStatusColors.BELUM_DIBUKA.bg,
    text: SessionStatusColors.BELUM_DIBUKA.text,
    label: 'Pending',
  },
  approved: {
    bg: SessionStatusColors.DIBUKA.bg,
    text: SessionStatusColors.DIBUKA.text,
    label: 'Disetujui',
  },
  rejected: {
    bg: SessionStatusColors.DITUTUP.bg,
    text: SessionStatusColors.DITUTUP.text,
    label: 'Ditolak',
  },
};

export default function StudentHistoryRoute() {
  const insets = useSafeAreaInsets();
  const { user, profile, role } = useAuth();
  const { sessions } = useSchedule();
  const uid = user?.uid ?? null;

  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activeSection, setActiveSection] = useState<HistorySection>('attendances');

  const sessionMap = useMemo(() => {
    const map = new Map<
      string,
      { className?: string; practicum?: string; module?: string; date?: string }
    >();
    for (const s of sessions) {
      map.set(s.id, {
        className: s.className,
        practicum: s.practicum,
        module: s.module,
        date: s.date,
      });
    }
    return map;
  }, [sessions]);

  useEffect(() => {
    if (!uid || role !== 'praktikan') {
      setAttendances([]);
      setPermits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    return subscribeStudentHistory(
      uid,
      (next) => {
        setAttendances(next.attendances);
        setPermits(next.permits);
        setLoading(next.loading);
        setError(null);
      },
      (err) => {
        setAttendances([]);
        setPermits([]);
        setLoading(false);
        setError(getHistoryErrorMessage(err));
      },
      sessionMap,
    );
  }, [uid, role, attempt, sessionMap]);

  function retry() {
    setAttempt((prev) => prev + 1);
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
        <View style={styles.backgroundTopStep} />
        <View style={styles.backgroundTopTile} />
        <View style={styles.backgroundBottomStep} />
        <View style={styles.backgroundBottomTile} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: 16, paddingBottom: insets.bottom + 32 },
        ]}>
        <Text accessibilityRole="header" style={styles.title}>
          Riwayat{'\n'}saya.
        </Text>

        <View style={styles.identityCard}>
          <Text style={styles.eyebrow}>PRAKTIKAN</Text>
          <Text style={styles.identityName}>{profile?.name ?? 'Praktikan'}</Text>
          {profile?.role === 'praktikan' && (
            <Text style={styles.description}>NIM {profile.nim}</Text>
          )}
        </View>

        <View style={styles.tabRow} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeSection === 'attendances' }}
            onPress={() => setActiveSection('attendances')}
            style={({ pressed }) => [
              styles.tabButton,
              activeSection === 'attendances' && styles.tabButtonSelected,
              pressed && styles.pressed,
            ]}>
            <Text
              style={[
                styles.tabButtonText,
                activeSection === 'attendances' && styles.tabButtonTextSelected,
              ]}>
              Riwayat Kehadiran ({attendances.length})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeSection === 'permits' }}
            onPress={() => setActiveSection('permits')}
            style={({ pressed }) => [
              styles.tabButton,
              activeSection === 'permits' && styles.tabButtonSelected,
              pressed && styles.pressed,
            ]}>
            <Text
              style={[
                styles.tabButtonText,
                activeSection === 'permits' && styles.tabButtonTextSelected,
              ]}>
              Status Izin ({permits.length})
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View
            style={styles.emptyState}
            accessibilityRole="progressbar"
            accessibilityLabel="Memuat riwayat">
            <ActivityIndicator color={BrandColors.forest} />
            <Text style={styles.description}>Memuat data riwayat praktikum...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Text accessibilityRole="alert" style={styles.cardTitle}>
              Riwayat belum dapat ditampilkan
            </Text>
            <Text style={styles.description}>{error}</Text>
            <AuthButton title="Coba lagi" onPress={retry} />
          </View>
        ) : activeSection === 'attendances' ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Riwayat kehadiran
              </Text>
              <Text style={styles.description}>{attendances.length} sesi</Text>
            </View>

            {attendances.length === 0 ? (
              <View style={styles.emptyState}>
                <Text accessibilityRole="header" style={styles.cardTitle}>
                  Belum ada catatan kehadiran
                </Text>
                <Text style={styles.description}>
                  Riwayat akan muncul di sini setelah kamu melakukan presensi pada sesi praktikum
                  yang dibuka asisten.
                </Text>
              </View>
            ) : (
              attendances.map((record) => {
                const timeText = formatCheckInTime(record.checkedInAt);
                return (
                  <View
                    key={record.id}
                    accessible
                    accessibilityLabel={`${record.sessionInfo.practicum}, ${record.sessionInfo.className}, hadir ${timeText}`}
                    style={styles.historyCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.classBadge}>
                        <Text style={styles.classText}>{record.sessionInfo.className}</Text>
                      </View>
                      <View style={styles.presentBadge}>
                        <Text style={styles.presentText}>Hadir</Text>
                      </View>
                    </View>
                    <View style={styles.cardHeading}>
                      <Text style={styles.cardTitle}>{record.sessionInfo.practicum}</Text>
                      <Text style={styles.description}>{record.sessionInfo.module}</Text>
                    </View>
                    <Text style={styles.detailValue}>Waktu hadir: {timeText}</Text>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Status izin yang diajukan
              </Text>
              <Text style={styles.description}>{permits.length} pengajuan</Text>
            </View>

            {permits.length === 0 ? (
              <View style={styles.emptyState}>
                <Text accessibilityRole="header" style={styles.cardTitle}>
                  Belum ada pengajuan izin
                </Text>
                <Text style={styles.description}>
                  Status izin yang kamu ajukan pada sesi praktikum akan tampil secara otomatis di
                  bagian ini.
                </Text>
              </View>
            ) : (
              permits.map((permit) => {
                const badge = PERMIT_STATUS_BADGE[permit.status];
                return (
                  <View key={permit.id} style={styles.historyCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.classBadge}>
                        <Text style={styles.classText}>{permit.sessionInfo.className}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusText, { color: badge.text }]}>
                          {badge.label}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardHeading}>
                      <Text style={styles.cardTitle}>{permit.sessionInfo.practicum}</Text>
                      <Text style={styles.description}>
                        {permit.sessionInfo.module} · {permit.sessionInfo.date}
                      </Text>
                    </View>

                    <View style={styles.reasonBox}>
                      <Text style={styles.boxLabel}>ALASAN IZIN</Text>
                      <Text style={styles.detailValue}>{permit.reason}</Text>
                    </View>

                    {permit.reviewNote ? (
                      <View style={styles.noteBox}>
                        <Text style={styles.boxLabel}>CATATAN ASISTEN</Text>
                        <Text style={styles.detailValue}>{permit.reviewNote}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
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
  tabRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tabButton: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonSelected: {
    borderColor: BrandColors.forest,
    backgroundColor: BrandColors.forest,
  },
  tabButtonText: {
    color: BrandColors.forestDeep,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  tabButtonTextSelected: {
    color: BrandColors.paper,
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
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
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
  reasonBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: BrandColors.pageBackground,
    gap: 4,
  },
  noteBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.softGreen,
    gap: 4,
  },
  boxLabel: {
    color: BrandColors.forestSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  emptyState: {
    padding: 18,
    gap: 8,
    borderLeftWidth: 4,
    borderColor: BrandColors.forestSoft,
    backgroundColor: BrandColors.softGreen,
  },
  pressed: {
    opacity: 0.75,
  },
});
