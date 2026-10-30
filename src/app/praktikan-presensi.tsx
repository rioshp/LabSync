import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  MOCK_ATTENDANCES,
  MOCK_SESSIONS,
  MOCK_USERS,
  type AttendanceRecord,
} from '@/constants/mockData';
import { BrandColors, SessionStatusColors } from '@/constants/theme';

const runtimeAttendances = new Map<string, AttendanceRecord>();

function getAttendanceKey(sessionId: string, userId: string) {
  return JSON.stringify([sessionId, userId]);
}

function findAttendance(
  key: string,
  sessionId: string,
  userNim: string,
): AttendanceRecord | null {
  return (
    runtimeAttendances.get(key) ??
    MOCK_ATTENDANCES.find(
      (record) => record.sessionId === sessionId && record.nim === userNim,
    ) ??
    null
  );
}

function formatAttendanceTime() {
  const time = new Date().toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return `${time} WIB`;
}

export default function PraktikanPresensiScreen() {
  const insets = useSafeAreaInsets();
  const { sessionId: sessionParam, userId: userParam } = useLocalSearchParams<{
    sessionId?: string | string[];
    userId?: string | string[];
  }>();
  const sessionId = Array.isArray(sessionParam) ? sessionParam[0] : sessionParam;
  const userId = Array.isArray(userParam) ? userParam[0] : userParam;
  const session = MOCK_SESSIONS.find((item) => item.id === sessionId);
  const user = MOCK_USERS.find(
    (item) => item.id === userId && item.peran === 'praktikan',
  );
  const attendanceKey =
    session && user ? getAttendanceKey(session.id, user.id) : '';
  const [attendanceSnapshot, setAttendanceSnapshot] = useState(() => ({
    key: attendanceKey,
    record:
      session && user
        ? findAttendance(attendanceKey, session.id, user.nim)
        : null,
  }));
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const attendance =
    attendanceSnapshot.key === attendanceKey
      ? attendanceSnapshot.record
      : session && user
        ? findAttendance(attendanceKey, session.id, user.nim)
        : null;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace({
      pathname: '/jadwal',
      params: { userId: user?.id ?? '', role: 'praktikan' },
    });
  }

  function checkIn() {
    if (
      !session ||
      !user ||
      session.status !== 'DIBUKA' ||
      findAttendance(attendanceKey, session.id, user.nim)
    ) {
      return;
    }

    const record: AttendanceRecord = {
      id: `att-${session.id}-${user.id}`,
      sessionId: session.id,
      namaPraktikum: session.namaPraktikum,
      kelas: session.kelas,
      namaPraktikan: user.nama,
      nim: user.nim,
      waktuHadir: formatAttendanceTime(),
    };

    runtimeAttendances.set(attendanceKey, record);
    setAttendanceSnapshot({ key: attendanceKey, record });
    setFeedbackVisible(true);
  }

  const status = session ? SessionStatusColors[session.status] : null;

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
          accessibilityLabel="Kembali ke daftar jadwal"
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <View accessible={false} style={[styles.navigationIcon, styles.backIcon]}>
            <View style={[styles.chevron, styles.chevronBack]} />
          </View>
          <Text style={styles.backText}>Kembali</Text>
        </Pressable>

        <Text accessibilityRole="header" style={styles.title}>
          Detail sesi{'\n'}praktikum.
        </Text>

        {!session ? (
          <View style={styles.emptyState}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Sesi tidak ditemukan
            </Text>
            <Text style={styles.description}>
              Kembali ke jadwal dan pilih sesi praktikum yang tersedia.
            </Text>
          </View>
        ) : !user ? (
          <View style={styles.emptyState}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Identitas praktikan tidak ditemukan
            </Text>
            <Text style={styles.description}>
              Kembali ke jadwal, lalu masuk dengan identitas praktikan yang sesuai.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.identityCard}>
              <Text style={styles.eyebrow}>PRAKTIKAN</Text>
              <Text style={styles.identityName}>{user.nama}</Text>
              <Text style={styles.description}>NIM {user.nim}</Text>
            </View>

            <View style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <View style={styles.classBadge}>
                  <Text style={styles.classText}>{session.kelas}</Text>
                </View>
                {status && (
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>
                      {status.label}
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

            {session.status !== 'DIBUKA' && (
              <View style={styles.emptyState}>
                <Text accessibilityRole="header" style={styles.cardTitle}>
                  {session.status === 'BELUM_DIBUKA'
                    ? 'Presensi belum dibuka'
                    : 'Sesi praktikum sudah ditutup'}
                </Text>
                <Text style={styles.description}>
                  {session.status === 'BELUM_DIBUKA'
                    ? 'Kamu belum dapat melakukan presensi. Silakan tunggu asisten membuka sesi.'
                    : 'Presensi untuk sesi ini sudah berakhir dan tidak dapat dilakukan.'}
                </Text>
              </View>
            )}

            {attendance ? (
              <View
                accessible
                accessibilityLabel={`Presensi berhasil pada ${attendance.waktuHadir}`}
                style={styles.attendanceCard}>
                <Text style={styles.eyebrow}>STATUS KEHADIRAN</Text>
                <Text style={styles.attendanceTitle}>Kamu sudah presensi</Text>
                <Text style={styles.description}>
                  Waktu hadir: {attendance.waktuHadir}
                </Text>
              </View>
            ) : session.status === 'DIBUKA' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Mencatat kehadiran untuk sesi praktikum ini"
                onPress={checkIn}
                style={({ pressed }) => [
                  styles.checkInButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.checkInText}>Presensi sekarang</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal
        visible={feedbackVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <View style={styles.successMark}>
              <Text style={styles.successMarkText}>✓</Text>
            </View>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              Presensi berhasil
            </Text>
            <Text style={styles.modalDescription}>
              Kehadiranmu sudah tercatat pada pukul{' '}
              {attendance?.waktuHadir ?? '-'}.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setFeedbackVisible(false)}
              style={({ pressed }) => [
                styles.modalButton,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.modalButtonText}>Selesai</Text>
            </Pressable>
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
  attendanceCard: {
    padding: 18,
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.softGreen,
  },
  attendanceTitle: {
    color: BrandColors.forestDeep,
    fontSize: 18,
    fontWeight: '700',
  },
  checkInButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: BrandColors.forest,
  },
  checkInText: {
    color: BrandColors.paper,
    fontSize: 16,
    fontWeight: '700',
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
    maxWidth: 400,
    alignItems: 'center',
    padding: 24,
    gap: 12,
    borderRadius: 20,
    backgroundColor: BrandColors.paper,
  },
  successMark: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: BrandColors.softGreen,
  },
  successMarkText: {
    color: BrandColors.forest,
    fontSize: 30,
    fontWeight: '800',
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
  modalButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: BrandColors.forest,
  },
  modalButtonText: {
    color: BrandColors.paper,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
