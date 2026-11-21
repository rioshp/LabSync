import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
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
import { formatSessionRange } from '@/features/academic/time';

import { styles } from './assistant-session.styles';

function checkedInTime(millis: number, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(millis));
  } catch {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(millis),
    );
  }
}

export default function AssistantSessionRoute() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    classId?: string | string[];
    sessionId?: string | string[];
  }>();
  const classId = Array.isArray(params.classId) ? params.classId[0] : (params.classId ?? null);
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : (params.sessionId ?? null);
  const { user, role } = useAuth();
  const sessionState = useAssistantSession(user?.uid, classId, sessionId);
  const session = sessionState.value;
  const statusBadge = session ? SessionStatusStyles[session.status] : null;
  const attendanceState = useSessionAttendance(user?.uid, session?.id ?? null);
  const summaryState = useSessionReviewSummary(
    user?.uid,
    session?.classId ?? null,
    session?.id ?? null,
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

  if (role !== 'asisten') {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>Halaman ini khusus asisten.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: 14, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ Kembali ke jadwal</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Detail{'\n'}sesi.
        </Text>
        {[sessionState, attendanceState, summaryState].some((source) => source.offline) && (
          <Text accessibilityLiveRegion="polite" style={styles.offlineNotice}>
            Data dari cache dan mungkin belum terbaru. Periksa koneksi sebelum mengubah status sesi.
          </Text>
        )}
        {sessionState.loading ? (
          <Loading label="Memuat detail sesi..." />
        ) : sessionState.error ? (
          <LoadError message={sessionState.error} retry={sessionState.retry} />
        ) : !session ? (
          <View style={styles.emptyCard}>
            <Text style={styles.cardTitle}>Sesi tidak ditemukan</Text>
            <Text style={styles.description}>
              Kembali ke jadwal dan pilih sesi yang masih tersedia.
            </Text>
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
              <Text style={styles.practicumName}>{session.practicum}</Text>
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
                  <View style={styles.liveNote}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>Presensi sedang dibuka</Text>
                  </View>
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
              {session.status === 'closed' ? (
                <Text style={styles.completedNote}>
                  Sesi sudah selesai. Rekap presensi dan ringkasan ulasan tersedia di bawah.
                </Text>
              ) : null}
              {session.status === 'cancelled' ? (
                <Text style={styles.completedNote}>
                  Sesi ini dibatalkan dan tidak dapat dibuka kembali.
                </Text>
              ) : null}
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.sectionHeader}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Rekap presensi
                </Text>
                <Text style={styles.countBadge}>{attendanceState.value.length} hadir</Text>
              </View>
              <Text style={styles.description}>
                Nama, NIM, dan waktu presensi diperbarui langsung.
              </Text>
              {attendanceState.loading ? (
                <Loading label="Memuat rekap presensi..." />
              ) : attendanceState.error ? (
                <LoadError message={attendanceState.error} retry={attendanceState.retry} />
              ) : attendanceState.value.length === 0 ? (
                <View style={styles.innerEmpty}>
                  <Text style={styles.cardTitle}>Belum ada praktikan yang presensi</Text>
                  <Text style={styles.description}>
                    {session.status === 'open'
                      ? 'Rekap akan terisi saat praktikan mulai hadir.'
                      : 'Rekap sesi ini masih kosong.'}
                  </Text>
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
                      {checkedInTime(record.checkedInAt.toMillis(), session.timeZone)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.sectionHeader}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Ringkasan ulasan
                </Text>
                <Text style={styles.countBadge}>{summaryState.value.totalSubmitted} ulasan</Text>
              </View>
              <Text style={styles.description}>
                Hanya jumlah sentimen yang ditampilkan. Isi dan identitas ulasan tetap privat.
              </Text>
              {summaryState.error ? (
                <LoadError message={summaryState.error} retry={summaryState.retry} />
              ) : (
                <>
                  {summaryState.loading && (
                    <View style={styles.inlineLoading}>
                      <ActivityIndicator color={BrandColors.forest} />
                      <Text style={styles.description}>Memuat ringkasan...</Text>
                    </View>
                  )}
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
                  <View style={styles.summaryFooter}>
                    <Text style={styles.summaryFootText}>
                      {summaryState.value.pendingCount} menunggu analisis
                    </Text>
                    <Text style={styles.summaryFootText}>
                      {summaryState.value.failedCount} gagal
                    </Text>
                  </View>
                  {!summaryState.loading && summaryState.value.totalSubmitted === 0 && (
                    <Text style={styles.emptyHint}>Belum ada ulasan untuk sesi ini.</Text>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        transparent
        visible={!!confirmStatus}
        animationType="fade"
        onRequestClose={() => {
          if (!submitting) setConfirmStatus(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
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
        </View>
      </Modal>
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
