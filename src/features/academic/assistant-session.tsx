import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton } from '@/components/auth-screen';
import {
  BottomSheetModal,
  DarkContourOverlay,
  DarkGradientOverlay,
  DiagonalHatchOverlay,
  ScreenBackdrop,
} from '@/components/labsync-brand';
import { BrandColors, SessionStatusStyles } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { mutationError, mutate } from '@/lib/mutations';
import {
  useAssistantSession,
  useSessionAttendance,
  useSessionReviewSummary,
} from '@/features/academic/useAcademic';
import { formatDateTime } from '@/features/academic/time';
import type { AcademicSession } from '@/features/academic/types';

import { styles } from './assistant-session.styles';

const ARROW_BACK_LIGHT = require('../../../assets/images/arrow-back-light.svg');

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

export default function AssistantSessionRoute() {
  const params = useLocalSearchParams<{
    classId?: string;
    sessionId?: string;
    section?: 'ulasan';
  }>();
  const classId = params.classId ?? null;
  const sessionId = params.sessionId ?? null;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [section, setSection] = useState<'Presensi' | 'Ulasan & AI'>(
    params.section === 'ulasan' ? 'Ulasan & AI' : 'Presensi',
  );
  const sessionState = useAssistantSession(classId, sessionId);
  const session = sessionState.value;
  const statusBadge = session ? SessionStatusStyles[session.status] : null;
  const showReviews = section === 'Ulasan & AI';
  const attendanceState = useSessionAttendance(
    user?.uid,
    showReviews ? null : (session?.id ?? null),
  );
  const summaryState = useSessionReviewSummary(
    user?.uid,
    showReviews ? (session?.classId ?? null) : null,
    showReviews ? (session?.id ?? null) : null,
  );
  const [confirmStatus, setConfirmStatus] = useState<'open' | 'close' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const transitionLock = useRef(false);

  async function confirmTransition() {
    if (!session || !classId || !confirmStatus || transitionLock.current) return;
    transitionLock.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      await mutate(confirmStatus === 'open' ? 'openSession' : 'closeSession', {
        classId,
        sessionId: session.id,
      });
      setConfirmStatus(null);
    } catch (error) {
      setActionError(mutationError(error));
    } finally {
      transitionLock.current = false;
      setSubmitting(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else if (classId) router.replace({ pathname: '/asisten/kelas', params: { classId } });
    else router.replace('/asisten/praktikum');
  }

  const totalReviews = summaryState.value.totalSubmitted;
  const positivePct =
    totalReviews > 0 ? Math.round((summaryState.value.positiveCount / totalReviews) * 100) : 0;
  const pillHeight = (count: number) =>
    totalReviews > 0 ? Math.max(42, Math.round((count / totalReviews) * 100)) : 42;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScreenBackdrop variant="geometric" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <View style={[styles.darkBand, { paddingTop: insets.top + 12 }]}>
          <DarkGradientOverlay />
          <DarkContourOverlay />
          <View style={styles.darkBandTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kembali"
              onPress={goBack}
              style={({ pressed }) => [styles.backCircle, pressed && styles.pressed]}
            >
              <Image
                source={ARROW_BACK_LIGHT}
                contentFit="contain"
                accessible={false}
                style={styles.backIcon}
              />
            </Pressable>
            {statusBadge ? (
              <View
                style={[
                  styles.statusBadge,
                  session?.status === 'open'
                    ? styles.statusBadgeOpen
                    : { backgroundColor: statusBadge.bg, borderColor: statusBadge.border },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: session?.status === 'open' ? BrandColors.ink : statusBadge.text },
                  ]}
                >
                  {session?.status === 'open' ? `● ${statusBadge.label}` : statusBadge.label}
                </Text>
              </View>
            ) : null}
          </View>

          {session ? (
            <>
              <View style={styles.headerInfo}>
                <Text style={styles.eyebrow}>
                  {session.className.toUpperCase()} · RUANG {session.room.toUpperCase()}
                </Text>
                <Text accessibilityRole="header" style={styles.sessionTitle}>
                  {session.module}
                </Text>
                <Text style={styles.darkSub}>
                  {formatStartDate(session)} · {session.startTime} – {session.endTime}
                </Text>
              </View>
              {actionError ? (
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {actionError}
                </Text>
              ) : null}
              {session.status === 'scheduled' ? (
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setActionError(null);
                      setConfirmStatus('open');
                    }}
                    style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.openButtonText}>Buka sesi sekarang</Text>
                  </Pressable>
                </View>
              ) : null}
              {session.status === 'open' ? (
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setActionError(null);
                      setConfirmStatus('close');
                    }}
                    style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                  >
                    <SymbolView
                      name={{
                        ios: 'exclamationmark.triangle',
                        android: 'warning_amber',
                        web: 'warning_amber',
                      }}
                      size={15}
                      tintColor={BrandColors.danger}
                    />
                    <Text style={styles.closeButtonText}>Tutup sesi sekarang</Text>
                  </Pressable>
                </View>
              ) : null}
              {session.status === 'cancelled' ? (
                <Text style={styles.completedNote}>
                  Sesi ini dibatalkan dan tidak dapat dibuka kembali.
                </Text>
              ) : null}
            </>
          ) : (
            <Text accessibilityRole="header" style={styles.sessionTitle}>
              Detail sesi
            </Text>
          )}
        </View>

        <View style={styles.body}>
          {sessionState.loading ? (
            <Loading label="Memuat detail sesi..." />
          ) : sessionState.error ? (
            <LoadError message={sessionState.error} retry={sessionState.retry} />
          ) : !session ? (
            <View style={styles.emptyCard}>
              <Text style={styles.cardTitle}>Sesi tidak ditemukan</Text>
              <Text style={styles.description}>Kembali dan pilih sesi yang masih tersedia.</Text>
            </View>
          ) : (
            <>
              <View accessibilityRole="tablist" style={styles.detailTabs}>
                {(['Presensi', 'Ulasan & AI'] as const).map((tab) => (
                  <Pressable
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: section === tab }}
                    onPress={() => setSection(tab)}
                    style={[styles.detailTab, section === tab && styles.selectedTab]}
                  >
                    <Text style={[styles.tabText, section === tab && styles.selectedTabText]}>
                      {tab}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {!showReviews ? (
                <View style={styles.summaryCard}>
                  <View style={styles.sectionHeader}>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>
                      Rekap presensi
                    </Text>
                    {!attendanceState.loading &&
                    !attendanceState.error &&
                    attendanceState.value.length > 0 ? (
                      <Text style={styles.countBadge}>{attendanceState.value.length} hadir</Text>
                    ) : null}
                  </View>
                  {attendanceState.loading ? (
                    <Loading label="Memuat rekap presensi..." />
                  ) : attendanceState.error ? (
                    <LoadError message={attendanceState.error} retry={attendanceState.retry} />
                  ) : attendanceState.value.length === 0 ? (
                    <View style={styles.innerEmpty}>
                      <Text style={styles.cardTitle}>Belum ada praktikan yang presensi</Text>
                    </View>
                  ) : (
                    attendanceState.value.map((record, idx) => (
                      <View
                        key={record.id}
                        style={[styles.attendanceRow, idx > 0 && styles.rowDivider]}
                      >
                        <Text style={styles.rowNumber}>{String(idx + 1).padStart(2, '0')}</Text>
                        <View style={styles.studentInfo}>
                          <Text style={styles.studentName}>{record.studentNameSnapshot}</Text>
                          <Text style={styles.description}>NIM {record.nimSnapshot}</Text>
                        </View>
                        <Text style={styles.attendanceTime}>
                          {formatDateTime(record.checkedInAt.toDate(), session.timeZone)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              ) : (
                <View style={styles.summaryCard}>
                  <View style={styles.sectionHeader}>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>
                      Sentimen ulasan mahasiswa
                    </Text>
                    {!summaryState.loading && !summaryState.error && totalReviews > 0 ? (
                      <Text style={styles.countBadge}>{totalReviews} ulasan</Text>
                    ) : null}
                  </View>
                  {summaryState.loading ? (
                    <Loading label="Memuat ringkasan…" />
                  ) : summaryState.error ? (
                    <LoadError message={summaryState.error} retry={summaryState.retry} />
                  ) : totalReviews === 0 ? (
                    <Text style={styles.emptyHint}>
                      {session.status === 'closed'
                        ? 'Belum ada ulasan yang dikirim untuk sesi ini.'
                        : 'Praktikan yang hadir bisa mengirim ulasan setelah sesi ditutup.'}
                    </Text>
                  ) : (
                    <>
                      <View style={styles.pillChartRow}>
                        <View style={styles.pillTrack}>
                          <View
                            style={[
                              styles.pillFill,
                              styles.pillFillPos,
                              { height: `${pillHeight(summaryState.value.positiveCount)}%` },
                            ]}
                          >
                            <Text style={styles.pillCountLight}>
                              {summaryState.value.positiveCount}
                            </Text>
                            <Text style={styles.pillLabelLight}>Positif · {positivePct}%</Text>
                          </View>
                        </View>
                        <View style={styles.pillTrack}>
                          <View
                            style={[
                              styles.pillFill,
                              styles.pillFillNeu,
                              { height: `${pillHeight(summaryState.value.neutralCount)}%` },
                            ]}
                          >
                            <Text style={styles.pillCountLight}>
                              {summaryState.value.neutralCount}
                            </Text>
                            <Text style={styles.pillLabelLight}>Netral</Text>
                          </View>
                        </View>
                        <View style={styles.pillTrack}>
                          <View
                            style={[
                              styles.pillFill,
                              styles.pillFillNeg,
                              { height: `${pillHeight(summaryState.value.negativeCount)}%` },
                            ]}
                          >
                            <DiagonalHatchOverlay tone="danger" size={140} />
                            <Text style={styles.pillCountNeg}>
                              {summaryState.value.negativeCount}
                            </Text>
                            <Text style={styles.pillLabelNeg}>Negatif</Text>
                          </View>
                        </View>
                      </View>
                      {summaryState.value.pendingCount > 0 ||
                      summaryState.value.failedCount > 0 ? (
                        <View style={styles.summaryFooter}>
                          {summaryState.value.pendingCount > 0 ? (
                            <Text style={styles.summaryFootText}>
                              {summaryState.value.pendingCount} menunggu analisis
                            </Text>
                          ) : null}
                          {summaryState.value.failedCount > 0 ? (
                            <Text style={styles.summaryFootText}>
                              {summaryState.value.failedCount} gagal dianalisis
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <BottomSheetModal
        visible={!!confirmStatus}
        title={confirmStatus === 'open' ? 'Buka sesi sekarang?' : 'Tutup sesi sekarang?'}
        subtitle={session?.module}
        danger={confirmStatus === 'close'}
        onClose={() => {
          if (!submitting) setConfirmStatus(null);
        }}
      >
        <Text style={styles.description}>
          {confirmStatus === 'open'
            ? 'Praktikan aktif di kelas dapat melakukan presensi setelah sesi dibuka.'
            : 'Sesi yang sudah selesai tidak dapat dibuka kembali. Rekap presensi dan ulasan tetap tersedia.'}
        </Text>
        <View style={styles.modalActions}>
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => setConfirmStatus(null)}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Batal</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void confirmTransition()}
            style={[
              confirmStatus === 'close' ? styles.dangerButton : styles.primaryButton,
              submitting && styles.disabledButton,
            ]}
          >
            {submitting ? (
              <ActivityIndicator
                color={confirmStatus === 'close' ? BrandColors.ink : BrandColors.paper}
              />
            ) : (
              <Text
                style={
                  confirmStatus === 'close' ? styles.dangerButtonText : styles.primaryButtonText
                }
              >
                {confirmStatus === 'open' ? 'Buka sesi' : 'Tutup sesi'}
              </Text>
            )}
          </Pressable>
        </View>
      </BottomSheetModal>
    </View>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={BrandColors.ink} />
      <Text style={styles.description}>{label}</Text>
    </View>
  );
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <View style={styles.innerEmpty}>
      <Text accessibilityRole="alert" style={styles.cardTitle}>
        Data belum dapat ditampilkan
      </Text>
      <Text style={styles.description}>{message}</Text>
      <AuthButton title="Coba lagi" onPress={retry} />
    </View>
  );
}
