import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton } from '@/components/auth-screen';
import { DotMatrixOverlay } from '@/components/labsync-brand';
import { BrandColors, SessionStatusStyles } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { groupSchedule } from '@/features/academic/time';
import type { AcademicSession } from '@/features/academic/types';
import { useSchedule } from '@/features/academic/useAcademic';

import { styles } from './schedule.styles';

type ScheduleFilter = 'open' | 'upcoming' | 'past';

const SCHEDULE_FILTERS: { key: ScheduleFilter; label: string }[] = [
  { key: 'open', label: 'Terbuka' },
  { key: 'upcoming', label: 'Mendatang' },
  { key: 'past', label: 'Selesai' },
];

function formatStartDate(session: AcademicSession) {
  try {
    return session.startsAt.toDate().toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: session.timeZone,
    });
  } catch {
    return session.date;
  }
}

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, role } = useAuth();
  const { value: sessions, loading, error, retry } = useSchedule(user?.uid, role);
  const isAssistant = role === 'asisten';
  const [filter, setFilter] = useState<ScheduleFilter>('open');
  const { open, upcoming, overdue, past } = groupSchedule(sessions);

  const upcomingSessions = [...upcoming, ...overdue];
  const filteredSessions =
    filter === 'open' ? open : filter === 'past' ? past : upcomingSessions;

  function openSession(session: AcademicSession) {
    router.push({
      pathname: isAssistant ? '/asisten/sesi' : '/praktikan/presensi',
      params: { classId: session.classId, sessionId: session.id },
    });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: 8, paddingBottom: insets.bottom + 106 },
        ]}
      >
        <View style={styles.heroCard}>
          <DotMatrixOverlay />
          <View style={styles.heroTop}>
            <Text style={styles.eyebrow}>
              {isAssistant
                ? 'ASISTEN PRAKTIKUM'
                : profile?.role === 'praktikan' && profile.nim
                  ? `PRAKTIKAN · ${profile.nim}`
                  : 'PRAKTIKAN'}
            </Text>
            <Text style={styles.identityName}>{profile?.displayName}</Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillText}>{upcoming.length} Mendatang</Text>
            </View>
          </View>
        </View>

        <View style={styles.filterRow} accessibilityRole="tablist">
          {SCHEDULE_FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(item.key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          {loading ? (
            <View
              style={styles.emptyState}
              accessibilityRole="progressbar"
              accessibilityLabel="Memuat jadwal"
            >
              <ActivityIndicator color={BrandColors.ink} />
              <Text style={styles.description}>Memuat jadwal…</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Text accessibilityRole="alert" style={styles.description}>
                {error}
              </Text>
              <AuthButton title="Coba lagi" onPress={retry} />
            </View>
          ) : filteredSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text accessibilityRole="header" style={styles.cardTitle}>
                {filter === 'open'
                  ? 'Belum ada sesi terbuka'
                  : filter === 'past'
                    ? 'Belum ada sesi selesai'
                    : 'Belum ada jadwal mendatang'}
              </Text>
              <Text style={styles.description}>
                {filter === 'open'
                  ? 'Sesi yang sedang dibuka untuk presensi akan muncul di sini.'
                  : filter === 'past'
                    ? 'Sesi yang sudah selesai atau dibatalkan akan muncul di sini.'
                    : isAssistant
                      ? 'Buat kelas dan jadwalkan sesi di tab Praktikum.'
                      : 'Jadwal sesi dari kelas aktif kamu akan muncul di sini.'}
              </Text>
            </View>
          ) : (
            filteredSessions.map((session) => {
              const status = SessionStatusStyles[session.status];
              const dateLabel = formatStartDate(session);
              const timeLabel = `${session.startTime} – ${session.endTime}`;
              return (
                <View key={session.id} style={styles.sessionCard}>
                  <View style={styles.sessionHeader}>
                    <View style={styles.classBadge}>
                      <Text numberOfLines={1} style={styles.classText}>
                        {session.className}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: status.bg, borderColor: status.border },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: status.text }]}>
                        {session.status === 'open' ? `● ${status.label}` : status.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{session.module}</Text>
                  <View style={styles.details}>
                    <View style={styles.detailRow}>
                      <SymbolView
                        name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
                        size={14}
                        tintColor={BrandColors.muted}
                      />
                      <Text
                        accessibilityLabel={`Tanggal: ${dateLabel}`}
                        style={styles.detailValue}
                      >
                        {dateLabel}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <SymbolView
                        name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
                        size={14}
                        tintColor={BrandColors.muted}
                      />
                      <Text
                        accessibilityLabel={`Waktu: ${timeLabel}`}
                        style={styles.detailValue}
                      >
                        {timeLabel}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <SymbolView
                        name={{ ios: 'mappin.and.ellipse', android: 'place', web: 'place' }}
                        size={14}
                        tintColor={BrandColors.muted}
                      />
                      <Text
                        accessibilityLabel={`Ruangan: ${session.room}`}
                        style={styles.detailValue}
                      >
                        Ruang {session.room}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint={
                      isAssistant
                        ? 'Membuka halaman kelola sesi'
                        : 'Membuka detail dan presensi sesi'
                    }
                    onPress={() => openSession(session)}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.actionButtonText}>
                      {isAssistant ? 'Kelola Sesi' : 'Lihat detail & Presensi'}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
