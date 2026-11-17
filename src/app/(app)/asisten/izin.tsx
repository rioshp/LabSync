import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton } from '@/components/auth-screen';
import { BrandColors, SessionStatusColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { getPermitErrorMessage, reviewPermit, subscribeAssistantPermits } from '@/lib/permits';
import type { Permit, PermitStatus } from '@/types/permit';

type FilterTab = 'all' | PermitStatus;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'rejected', label: 'Ditolak' },
];

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

export default function AssistantPermitsRoute() {
  const insets = useSafeAreaInsets();
  const { user, profile, role } = useAuth();
  const uid = user?.uid ?? null;

  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const [selectedPermit, setSelectedPermit] = useState<Permit | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!uid || role !== 'asisten') {
      setPermits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    return subscribeAssistantPermits(
      uid,
      (next) => {
        setPermits(next.permits);
        setLoading(next.loading);
        setError(null);
      },
      (err) => {
        setPermits([]);
        setLoading(false);
        setError(getPermitErrorMessage(err));
      },
    );
  }, [uid, role, attempt]);

  function retry() {
    setAttempt((prev) => prev + 1);
  }

  function openReviewModal(permit: Permit, action: 'approved' | 'rejected') {
    setSelectedPermit(permit);
    setReviewAction(action);
    setReviewNote('');
    setModalError(null);
  }

  function closeReviewModal() {
    if (submitting) return;
    setSelectedPermit(null);
    setReviewAction(null);
    setReviewNote('');
    setModalError(null);
  }

  async function handleConfirmReview() {
    if (!selectedPermit || !reviewAction || !uid) return;
    if (reviewAction === 'rejected' && !reviewNote.trim()) {
      setModalError('Catatan penolakan wajib diisi.');
      return;
    }

    setSubmitting(true);
    setModalError(null);
    try {
      await reviewPermit(selectedPermit.id, {
        status: reviewAction,
        reviewedBy: uid,
        reviewNote,
      });
      setSelectedPermit(null);
      setReviewAction(null);
      setReviewNote('');
    } catch (err) {
      setModalError(getPermitErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredPermits =
    activeTab === 'all' ? permits : permits.filter((item) => item.status === activeTab);

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
          Daftar{'\n'}izin.
        </Text>

        <View style={styles.identityCard}>
          <Text style={styles.eyebrow}>ASISTEN</Text>
          <Text style={styles.identityName}>{profile?.name ?? 'Asisten Praktikum'}</Text>
          <Text style={styles.description}>
            Tinjau dan verifikasi pengajuan izin praktikan pada sesi Anda.
          </Text>
        </View>

        <View style={styles.filterRow} accessibilityRole="tablist">
          {FILTER_TABS.map((tab) => {
            const selected = activeTab === tab.key;
            const count =
              tab.key === 'all'
                ? permits.length
                : permits.filter((p) => p.status === tab.key).length;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => [
                  styles.filterTab,
                  selected && styles.filterTabSelected,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.filterTabText, selected && styles.filterTabTextSelected]}>
                  {tab.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Pengajuan izin
            </Text>
            {!loading && !error && (
              <Text style={styles.description}>{filteredPermits.length} pengajuan</Text>
            )}
          </View>

          {loading ? (
            <View
              style={styles.emptyState}
              accessibilityRole="progressbar"
              accessibilityLabel="Memuat daftar izin">
              <ActivityIndicator color={BrandColors.forest} />
              <Text style={styles.description}>Memuat pengajuan izin praktikan...</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Text accessibilityRole="alert" style={styles.cardTitle}>
                Daftar izin belum dapat ditampilkan
              </Text>
              <Text style={styles.description}>{error}</Text>
              <AuthButton title="Coba lagi" onPress={retry} />
            </View>
          ) : filteredPermits.length === 0 ? (
            <View style={styles.emptyState}>
              <Text accessibilityRole="header" style={styles.cardTitle}>
                Belum ada pengajuan izin
              </Text>
              <Text style={styles.description}>
                {activeTab === 'all'
                  ? 'Belum ada praktikan yang mengajukan izin pada sesi praktikum Anda.'
                  : 'Tidak ada pengajuan izin dengan status yang dipilih.'}
              </Text>
            </View>
          ) : (
            filteredPermits.map((permit) => {
              const badge = PERMIT_STATUS_BADGE[permit.status];
              return (
                <View key={permit.id} style={styles.permitCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.classBadge}>
                      <Text style={styles.classText}>{permit.sessionInfo.className}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                  </View>

                  <View style={styles.studentHeading}>
                    <Text style={styles.cardTitle}>{permit.studentName}</Text>
                    <Text style={styles.description}>NIM {permit.nim}</Text>
                  </View>

                  <View style={styles.sessionBox}>
                    <Text style={styles.sessionTitle}>{permit.sessionInfo.practicum}</Text>
                    <Text style={styles.description}>
                      {permit.sessionInfo.module} · {permit.sessionInfo.date}
                    </Text>
                  </View>

                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonLabel}>ALASAN IZIN</Text>
                    <Text style={styles.reasonText}>{permit.reason}</Text>
                  </View>

                  {permit.reviewNote ? (
                    <View style={styles.noteBox}>
                      <Text style={styles.reasonLabel}>CATATAN ASISTEN</Text>
                      <Text style={styles.detailValue}>{permit.reviewNote}</Text>
                    </View>
                  ) : null}

                  {permit.status === 'pending' ? (
                    <View style={styles.actionRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Tolak izin ${permit.studentName}`}
                        onPress={() => openReviewModal(permit, 'rejected')}
                        style={({ pressed }) => [
                          styles.actionButton,
                          styles.rejectButton,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={styles.rejectButtonText}>Tolak</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Setujui izin ${permit.studentName}`}
                        onPress={() => openReviewModal(permit, 'approved')}
                        style={({ pressed }) => [
                          styles.actionButton,
                          styles.approveButton,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={styles.approveButtonText}>Setujui</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={!!selectedPermit && !!reviewAction}
        onRequestClose={closeReviewModal}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              {reviewAction === 'approved' ? 'Setujui Izin' : 'Tolak Izin'}
            </Text>
            <Text style={styles.modalDescription}>
              {reviewAction === 'approved'
                ? `Apakah Anda yakin ingin menyetujui pengajuan izin dari ${selectedPermit?.studentName ?? ''}?`
                : `Apakah Anda yakin ingin menolak pengajuan izin dari ${selectedPermit?.studentName ?? ''}? Wajib sertakan alasan penolakan.`}
            </Text>

            <View style={styles.inputField}>
              <Text style={styles.inputLabel}>
                {reviewAction === 'rejected'
                  ? 'Catatan Penolakan (Wajib)'
                  : 'Catatan Tambahan (Opsional)'}
              </Text>
              <TextInput
                value={reviewNote}
                onChangeText={(value) => {
                  setReviewNote(value);
                  if (modalError) setModalError(null);
                }}
                placeholder={
                  reviewAction === 'rejected'
                    ? 'Tulis alasan penolakan izin...'
                    : 'Tambahkan catatan untuk praktikan (opsional)...'
                }
                placeholderTextColor={BrandColors.muted}
                multiline
                editable={!submitting}
                style={styles.textInput}
              />
            </View>

            {modalError ? (
              <Text accessibilityRole="alert" style={styles.modalErrorText}>
                {modalError}
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={closeReviewModal}
                style={({ pressed }) => [styles.modalCancelButton, pressed && styles.pressed]}>
                <Text style={styles.modalCancelText}>Batal</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={handleConfirmReview}
                style={({ pressed }) => [
                  styles.modalConfirmButton,
                  reviewAction === 'rejected' && styles.modalConfirmDanger,
                  submitting && styles.disabledButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.modalConfirmText}>
                  {submitting
                    ? 'Memproses...'
                    : reviewAction === 'approved'
                      ? 'Ya, Setujui'
                      : 'Ya, Tolak'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
  },
  filterTabSelected: {
    borderColor: BrandColors.forest,
    backgroundColor: BrandColors.forest,
  },
  filterTabText: {
    color: BrandColors.forestDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  filterTabTextSelected: {
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
  permitCard: {
    padding: 16,
    gap: 12,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  studentHeading: {
    gap: 2,
  },
  cardTitle: {
    color: BrandColors.ink,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  sessionBox: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: BrandColors.line,
    gap: 2,
  },
  sessionTitle: {
    color: BrandColors.forestDeep,
    fontSize: 15,
    fontWeight: '700',
  },
  reasonBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: BrandColors.pageBackground,
    gap: 4,
  },
  reasonLabel: {
    color: BrandColors.forestSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  reasonText: {
    color: BrandColors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  noteBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.softGreen,
    gap: 4,
  },
  detailValue: {
    color: BrandColors.ink,
    fontSize: 13,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 4,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    borderWidth: 2,
    borderColor: BrandColors.danger,
    backgroundColor: BrandColors.paper,
  },
  rejectButtonText: {
    color: BrandColors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  approveButton: {
    backgroundColor: BrandColors.forest,
  },
  approveButtonText: {
    color: BrandColors.paper,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    padding: 18,
    gap: 8,
    borderLeftWidth: 4,
    borderColor: BrandColors.forestSoft,
    backgroundColor: BrandColors.softGreen,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(6, 52, 49, 0.45)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    gap: 14,
    borderRadius: 20,
    backgroundColor: BrandColors.paper,
  },
  modalTitle: {
    color: BrandColors.forestDeep,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalDescription: {
    color: BrandColors.forestSoft,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  inputField: {
    gap: 6,
  },
  inputLabel: {
    color: BrandColors.forestDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  textInput: {
    minHeight: 88,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
    color: BrandColors.ink,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  modalErrorText: {
    color: BrandColors.danger,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: BrandColors.softGreen,
  },
  modalConfirmButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: BrandColors.forest,
  },
  modalConfirmDanger: {
    backgroundColor: BrandColors.danger,
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalCancelText: {
    color: BrandColors.forestDeep,
    fontSize: 15,
    fontWeight: '700',
  },
  modalConfirmText: {
    color: BrandColors.paper,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
