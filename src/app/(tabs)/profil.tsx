import type { User } from '@react-native-firebase/auth';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton, AuthError, AuthField } from '@/components/auth-screen';
import { CsGraphLogo } from '@/components/labsync-brand';
import { LogoutButton } from '@/components/logout-button';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 106 }}
      >
        <View style={[styles.darkHeader, { paddingTop: insets.top + 10 }]}>
          <View style={styles.topRow}>
            <View style={styles.topLeft}>
              <CsGraphLogo size={26} inverted />
              <Text style={styles.topTitle}>Profil</Text>
            </View>
            <LogoutButton inverted />
          </View>

          <View style={styles.avatarBlock}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initialsOf(profile.displayName)}</Text>
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BrandColors.inkSoft,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
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
});
