import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MOCK_SESSIONS } from '@/constants/mockData';
import { BrandColors, SessionStatusColors } from '@/constants/theme';

export default function AsistenSesi() {
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  const initialSessionData = MOCK_SESSIONS.find((s) => s.id === id);

  const [session, setSession] = useState(initialSessionData);
  const [modalVisible, setModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'buka' | 'tutup' | null>(null);

  if (!session) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.content, { paddingTop: insets.top + 60 }]}>
          <View style={styles.emptyState}>
            <Text style={styles.cardTitle}>Sesi tidak ditemukan</Text>
            <Text style={styles.description}>Data sesi tidak valid atau tidak ditemukan.</Text>
          </View>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>Kembali</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const handleOpenModal = (type: 'buka' | 'tutup') => {
    setActionType(type);
    setModalVisible(true);
  };

  const handleConfirmAction = () => {
    const newStatus = actionType === 'buka' ? 'DIBUKA' : 'DITUTUP';
    
    setSession({ ...session, status: newStatus });
    
    const sessionIndex = MOCK_SESSIONS.findIndex((s) => s.id === session.id);
    if (sessionIndex !== -1) {
      MOCK_SESSIONS[sessionIndex].status = newStatus;
    }

    setModalVisible(false);
    setActionType(null);
  };

  const isOpen = session.status === 'DIBUKA';
  const isClosed = session.status === 'DITUTUP';
  const isNotStarted = session.status === 'BELUM_DIBUKA';

  const statusTheme = SessionStatusColors[session.status];

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
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <View accessible={false} style={[styles.navigationIcon, styles.backIcon]}>
            <View style={[styles.chevron, styles.chevronBack]} />
          </View>
          <Text style={styles.backText}>Kembali</Text>
        </Pressable>

        <Text accessibilityRole="header" style={styles.title}>
          Kelola sesi{'\n'}praktikum.
        </Text>

        <View style={styles.identityCard}>
          <Text style={styles.eyebrow}>ASISTEN</Text>
          <Text style={styles.identityName}>Mengelola Sesi</Text>
          <Text style={styles.description}>Pastikan sesi ditutup jika praktikum selesai.</Text>
        </View>

        <View style={styles.sessionCard}>
          <View style={styles.sessionHeader}>
            <View style={styles.classBadge}>
              <Text style={styles.classText}>{session.kelas}</Text>
            </View>
            {statusTheme && (
              <View style={[styles.statusBadge, { backgroundColor: statusTheme.bg }]}>
                <Text style={[styles.statusText, { color: statusTheme.text }]}>
                  {statusTheme.label}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.sessionHeading}>
            <Text style={styles.cardTitle}>{session.namaPraktikum}</Text>
            <Text style={styles.description}>{session.modul}</Text>
          </View>

          <View style={styles.details}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Waktu</Text>
              <Text style={styles.detailValue}>{session.waktu}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Ruangan</Text>
              <Text style={styles.detailValue}>{session.ruangan}</Text>
            </View>
          </View>
        </View>

        {isNotStarted && (
          <View style={styles.emptyState}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Sesi belum dimulai</Text>
            <Text style={styles.description}>
              Praktikan belum dapat melakukan presensi. Silakan buka sesi terlebih dahulu.
            </Text>
          </View>
        )}
        
        {isClosed && (
          <View style={[styles.emptyState, { borderColor: '#E53E3E', backgroundColor: '#FFF5F5' }]}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: '#C53030' }]}>Sesi telah berakhir</Text>
            <Text style={styles.description}>
              Sesi presensi ini sudah ditutup. Praktikan tidak lagi dapat mencatat kehadiran.
            </Text>
          </View>
        )}


        <View style={styles.actionSection}>
          {!isOpen ? (
            <Pressable 
              style={({ pressed }) => [styles.submit, styles.openSubmit, pressed && styles.pressed]} 
              onPress={() => handleOpenModal('buka')}
            >
              <Text style={styles.submitText}>Buka Sesi Presensi</Text>
            </Pressable>
          ) : (
            <Pressable 
              style={({ pressed }) => [styles.submit, styles.closeSubmit, pressed && styles.pressed]} 
              onPress={() => handleOpenModal('tutup')}
            >
              <Text style={styles.submitText}>Tutup Sesi Presensi</Text>
            </Pressable>
          )}

          <Pressable 
            style={({ pressed }) => [styles.secondarySubmit, pressed && styles.pressed]} 
            onPress={() => router.push({ pathname: '/rekap-asisten', params: { sessionId: session.id } })}
          >
            <Text style={styles.secondarySubmitText}>Lihat Rekap Kehadiran</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.modalTitle}>Konfirmasi</Text>
            <Text style={styles.modalDescription}>
              Apakah Anda yakin ingin {actionType === 'buka' ? 'MEMBUKA' : 'MENUTUP'} sesi praktikum ini?
            </Text>
            
            <View style={styles.modalActions}>
              <Pressable 
                style={({ pressed }) => [styles.modalCancelButton, pressed && styles.pressed]} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </Pressable>
              
              <Pressable 
                style={({ pressed }) => [
                  styles.modalConfirmButton, 
                  actionType === 'tutup' && styles.modalConfirmDanger,
                  pressed && styles.pressed
                ]} 
                onPress={handleConfirmAction}
              >
                <Text style={styles.modalConfirmText}>Ya, Lanjutkan</Text>
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
  backBtn: {
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
  sessionCard: {
    padding: 14,
    gap: 14,
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
  details: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: BrandColors.line,
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
  },
  detailLabel: {
    width: 64,
    color: BrandColors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  detailValue: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
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
  actionSection: {
    gap: 12,
    marginTop: 10,
  },
  submit: {
    minHeight: 56,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openSubmit: {
    backgroundColor: BrandColors.forest,
  },
  closeSubmit: {
    backgroundColor: '#E53E3E',
  },
  submitText: {
    color: BrandColors.paper,
    fontSize: 16,
    fontWeight: '700',
  },
  secondarySubmit: {
    minHeight: 56,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.paper,
    borderWidth: 2,
    borderColor: BrandColors.forest,
  },
  secondarySubmitText: {
    color: BrandColors.forest,
    fontSize: 16,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(6, 52, 49, 0.45)', // Sesuai warna tim
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    padding: 24,
    gap: 12,
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
    marginBottom: 10,
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
    backgroundColor: '#E53E3E',
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
  backButton: {
    marginTop: 10,
    padding: 10,
    backgroundColor: BrandColors.forest,
    borderRadius: 8,
    alignItems: 'center'
  },
});