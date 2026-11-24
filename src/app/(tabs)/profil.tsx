import type { User } from '@react-native-firebase/auth';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton, AuthError, AuthField } from '@/components/auth-screen';
import {
  CsGraphLogo,
  DarkContourOverlay,
  DarkGradientOverlay,
  ScreenBackdrop,
} from '@/components/labsync-brand';
import { LogoutButton } from '@/components/logout-button';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { getAuthErrorMessage } from '@/lib/auth';
import { updateAccountProfile } from '@/lib/profile';
import type { UserProfile } from '@/types/user';

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileScreen() {
  const { user, profile } = useAuth();
  return user && profile ? <ProfileContent key={user.uid} user={user} profile={profile} /> : null;
}

function ProfileContent({ user, profile }: { user: User; profile: UserProfile }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Partial<{ name: string; nim: string }>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  const name = draft.name ?? profile.displayName;
  const nim = draft.nim ?? profile.nim ?? '';
  const roleLabel = profile.role === 'asisten' ? 'Asisten Praktikum' : 'Praktikan';

  async function saveProfile() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await updateAccountProfile(name, nim);
      setDraft({});
      setFeedback({ text: 'Perubahan profil disimpan.' });
    } catch (error) {
      setFeedback({ text: getAuthErrorMessage(error), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenBackdrop variant="waves" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 106 }}
      >
        <View style={[styles.darkHeader, { paddingTop: insets.top + 10 }]}>
          <DarkGradientOverlay />
          <DarkContourOverlay />
          <View style={styles.topRow}>
            <View style={styles.topLeft}>
              <CsGraphLogo size={26} inverted />
              <Text style={styles.topTitle}>Profil</Text>
            </View>
            <LogoutButton inverted />
          </View>

          <View style={styles.avatarBlock}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{initialsOf(profile.displayName)}</Text>
              </View>
            </View>
            <Text style={styles.profileName}>{profile.displayName}</Text>
            <Text style={styles.profileEmail}>{user.email ?? 'Email tidak tersedia'}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryPillText}>{roleLabel}</Text>
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              Data profil
            </Text>
            <AuthField
              label="Nama lengkap"
              icon="user"
              value={name}
              onChangeText={(value) => setDraft((previous) => ({ ...previous, name: value }))}
              maxLength={100}
              autoComplete="name"
              editable={!busy}
            />
            {profile.role === 'praktikan' ? (
              <AuthField
                label="NIM"
                icon="id"
                value={nim}
                onChangeText={(value) => setDraft((previous) => ({ ...previous, nim: value }))}
                maxLength={30}
                autoCorrect={false}
                autoCapitalize="characters"
                editable={!busy}
              />
            ) : null}
            <AuthButton
              title="Simpan perubahan"
              busy={busy}
              disabled={
                busy ||
                !name.trim() ||
                (profile.role === 'praktikan' && !nim.trim()) ||
                (name.trim() === profile.displayName &&
                  nim.trim().toUpperCase() === (profile.nim ?? ''))
              }
              onPress={saveProfile}
            />
            {feedback ? (
              feedback.error ? (
                <AuthError message={feedback.text} />
              ) : (
                <View style={styles.successBox}>
                  <Text accessibilityLiveRegion="polite" style={styles.successText}>
                    {feedback.text}
                  </Text>
                </View>
              )
            ) : null}
          </View>

          <NotificationCard />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function NotificationCard() {
  const { status, pushToken, loading, requestPermission, refreshStatus, openSettings } =
    useNotifications();

  const isGranted = status === 'granted';
  const isDenied = status === 'denied';
  const isUndetermined = status === 'undetermined';
  const isUnsupported = status === 'unsupported';

  const badgeConfig = {
    granted: { label: 'Aktif', bg: '#E4E2DD', text: BrandColors.ink, border: BrandColors.line },
    denied: {
      label: 'Ditolak',
      bg: BrandColors.dangerSoft,
      text: BrandColors.danger,
      border: BrandColors.danger,
    },
    undetermined: {
      label: 'Belum Aktif',
      bg: '#F8F7F4',
      text: BrandColors.muted,
      border: BrandColors.line,
    },
    unsupported: {
      label: 'Tidak Didukung',
      bg: '#F8F7F4',
      text: BrandColors.muted,
      border: BrandColors.line,
    },
  }[status];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          <Text accessibilityRole="header" style={styles.title}>
            Notifikasi praktikum
          </Text>
          <Text style={styles.cardSubtitle}>Pemberitahuan sesi dibuka, jadwal, dan izin</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: badgeConfig.bg, borderColor: badgeConfig.border },
          ]}
        >
          <Text style={[styles.statusBadgeText, { color: badgeConfig.text }]}>
            {badgeConfig.label}
          </Text>
        </View>
      </View>

      <Text style={styles.notificationDesc}>
        {isGranted
          ? 'Perangkat ini siap menerima push notification langsung saat sesi dibuka, jadwal diperbarui, atau izin disetujui/ditolak.'
          : isDenied
            ? 'Izin notifikasi diblokir di pengaturan sistem perangkat. Kamu tidak akan menerima info sesi presensi atau keputusan izin secara langsung.'
            : isUnsupported
              ? 'Fitur push notification memerlukan perangkat fisik Android/iOS yang terhubung ke layanan FCM.'
              : 'Aktifkan notifikasi sekarang agar tidak ketinggalan jadwal praktikum, pembukaan sesi presensi, dan konfirmasi izin.'}
      </Text>

      {isUndetermined ? (
        <AuthButton title="Aktifkan notifikasi" busy={loading} onPress={requestPermission} />
      ) : null}

      {isDenied ? (
        <View style={styles.buttonStack}>
          <AuthButton title="Buka pengaturan sistem" variant="outline" onPress={openSettings} />
          <Pressable
            accessibilityRole="button"
            onPress={refreshStatus}
            style={({ pressed }) => [styles.secondaryLink, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryLinkText}>Periksa ulang izin</Text>
          </Pressable>
        </View>
      ) : null}

      {isGranted && pushToken ? (
        <View style={styles.tokenBox}>
          <Text style={styles.tokenLabel}>Token push aktif:</Text>
          <Text numberOfLines={1} ellipsizeMode="middle" style={styles.tokenValue}>
            {pushToken}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BrandColors.pageBackground,
  },
  darkHeader: {
    backgroundColor: BrandColors.ink,
    paddingHorizontal: 18,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: 16,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  topTitle: {
    color: BrandColors.paper,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: 5,
  },
  avatarRing: {
    padding: 4,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    marginBottom: 2,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BrandColors.inkSoft,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: BrandColors.paper,
    fontSize: 19,
    fontWeight: '800',
  },
  profileName: {
    color: BrandColors.paper,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  profileEmail: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 12.5,
  },
  body: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 16,
    marginTop: -18,
    gap: 14,
  },
  summaryPill: {
    backgroundColor: BrandColors.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BrandColors.line,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  summaryPillText: {
    color: BrandColors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  card: {
    backgroundColor: BrandColors.paper,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 16,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  title: {
    color: BrandColors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  successBox: {
    backgroundColor: BrandColors.soft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  successText: {
    color: BrandColors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    gap: 3,
  },
  cardSubtitle: {
    color: BrandColors.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  notificationDesc: {
    color: BrandColors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  buttonStack: {
    gap: 10,
  },
  secondaryLink: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  secondaryLinkText: {
    color: BrandColors.ink,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
  tokenBox: {
    backgroundColor: BrandColors.soft,
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  tokenLabel: {
    color: BrandColors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  tokenValue: {
    color: BrandColors.ink,
    fontSize: 11.5,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
