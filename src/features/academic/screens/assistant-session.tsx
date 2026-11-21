import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton } from '@/components/auth-screen';
import { BrandColors, SessionStatusStyles } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { mutationError, mutate } from '@/lib/mutations';
import {
  useAssistantSession,
  useSessionAttendance,
  useSessionReviewSummary,
} from '@/features/academic/useAcademic';
import { formatDateTime, formatSessionRange } from '@/features/academic/time';

import { styles } from './assistant-session.styles';

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

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Kembali</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Detail sesi
        </Text>
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
            <View style={styles.identityCard}>
              <View style={styles.sessionHeader}>
                <View style={styles.classBadge}>
                  <Text style={styles.classBadgeText}>{session.className}</Text>
                </View>
                {statusBadge && (
                  <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                    <Text style={[styles.statusText, { color: statusBadge.text }]}>
                      {statusBadge.label}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.sessionTitle}>{session.module}</Text>
              <Text style={styles.description}>{formatSessionRange(session)}</Text>
              <Text style={styles.description}>Ruang {session.room}</Text>
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
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>Buka sesi</Text>
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
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeButtonText}>Tutup sesi</Text>
                  </Pressable>
                </View>
              ) : null}
              {session.status === 'cancelled' ? (
                <Text style={styles.completedNote}>
                  Sesi ini dibatalkan dan tidak dapat dibuka kembali.
                </Text>
              ) : null}
            </View>

            {confirmStatus && (
              <View style={styles.summaryCard}>
                <Text accessibilityRole="header" style={styles.modalTitle}>
                  {confirmStatus === 'open' ? 'Buka sesi sekarang?' : 'Tutup sesi sekarang?'}
                </Text>
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
                    style={[styles.primaryButton, submitting && styles.disabledButton]}
                  >
                    {submitting ? (
                      <ActivityIndicator color={BrandColors.paper} />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {confirmStatus === 'open' ? 'Buka sesi' : 'Tutup sesi'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
            <View accessibilityRole="tablist" style={styles.detailTabs}>
              {(['Presensi', 'Ulasan & AI'] as const).map((tab) => (
                <Pressable
                  key={tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: section === tab }}
                  onPress={() => setSection(tab)}
                  style={[styles.detailTab, section === tab && styles.selectedTab]}
                >
                  <Text style={[styles.backText, section === tab && styles.selectedTabText]}>
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
                    attendanceState.value.length > 0 && (
                      <Text style={styles.countBadge}>{attendanceState.value.length} hadir</Text>
                    )}
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
                  attendanceState.value.map((record) => (
                    <View key={record.id} style={styles.attendanceRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {record.studentNameSnapshot.trim().charAt(0).toLocaleUpperCase('id-ID')}
                        </Text>
                      </View>
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
                  {!summaryState.loading &&
                    !summaryState.error &&
                    summaryState.value.totalSubmitted > 0 && (
                      <Text style={styles.countBadge}>
                        {summaryState.value.totalSubmitted} ulasan
                      </Text>
                    )}
                </View>
                {summaryState.loading ? (
                  <Loading label="Memuat ringkasan…" />
                ) : summaryState.error ? (
                  <LoadError message={summaryState.error} retry={summaryState.retry} />
                ) : summaryState.value.totalSubmitted === 0 ? (
                  <Text style={styles.emptyHint}>
                    {session.status === 'closed'
                      ? 'Belum ada ulasan yang dikirim untuk sesi ini.'
                      : 'Praktikan yang hadir bisa mengirim ulasan setelah sesi ditutup.'}
                  </Text>
                ) : (
                  <>
                    <View style={styles.sentimentGrid}>
                      <SentimentCard
                        label="Positif"
                        count={summaryState.value.positiveCount}
                        color="#24734A"
                        background="#E8F5EC"
                      />
                      <SentimentCard
                        label="Netral"
                        count={summaryState.value.neutralCount}
                        color="#53666B"
                        background="#EFF3F4"
                      />
                      <SentimentCard
                        label="Negatif"
                        count={summaryState.value.negativeCount}
                        color="#A34848"
                        background="#FCECEC"
                      />
                    </View>
                    {(summaryState.value.pendingCount > 0 ||
                      summaryState.value.failedCount > 0) && (
                      <View style={styles.summaryFooter}>
                        {summaryState.value.pendingCount > 0 && (
                          <Text style={styles.summaryFootText}>
                            {summaryState.value.pendingCount} menunggu analisis
                          </Text>
                        )}
                        {summaryState.value.failedCount > 0 && (
                          <Text style={styles.summaryFootText}>
                            {summaryState.value.failedCount} gagal dianalisis
                          </Text>
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SentimentCard({
  label,
  count,
  color,
  background,
}: {
  label: string;
  count: number;
  color: string;
  background: string;
}) {
  return (
    <View style={[styles.sentimentCard, { backgroundColor: background }]}>
      <Text style={[styles.sentimentCount, { color }]}>{count}</Text>
      <Text style={[styles.sentimentLabel, { color }]}>{label}</Text>
    </View>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={BrandColors.forest} />
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
