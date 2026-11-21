import { getIdTokenResult, type User } from '@react-native-firebase/auth';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthButton, AuthError, AuthField } from '@/components/auth-screen';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { addAccountPassword, getAuthErrorMessage } from '@/lib/auth';
import { updateAccountProfile } from '@/lib/profile';
import type { UserProfile } from '@/types/user';

export default function ProfileScreen() {
  const { user, profile } = useAuth();
  return user && profile ? <ProfileContent key={user.uid} user={user} profile={profile} /> : null;
}

function ProfileContent({ user, profile }: { user: User; profile: UserProfile }) {
  const [draft, setDraft] = useState<Partial<{ name: string; nim: string }>>({});
  const [provider, setProvider] = useState<string | null>(null);
  const [passwordAdded, setPasswordAdded] = useState(false);
  const [addingPassword, setAddingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [feedback, setFeedback] = useState<{
    section: 'profile' | 'password';
    text: string;
    error?: boolean;
  } | null>(null);

  const name = draft.name ?? profile.displayName;
  const nim = draft.nim ?? profile.nim ?? '';
  const hasGoogle = user.providerData.some(({ providerId }) => providerId === 'google.com');
  const hasPassword =
    passwordAdded || user.providerData.some(({ providerId }) => providerId === 'password');
  const currentMethod =
    provider === 'google.com' ? 'Google' : provider === 'password' ? 'Email dan password' : null;

  useEffect(() => {
    let active = true;
    void getIdTokenResult(user)
      .then(({ signInProvider }) => {
        if (active) setProvider(signInProvider);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  async function save(section: 'profile' | 'password') {
    if (busy) return;
    setBusy(section);
    setFeedback(null);
    try {
      if (section === 'profile') {
        await updateAccountProfile(name, nim);
        setDraft({});
      } else {
        await addAccountPassword(password, confirmation);
        setPasswordAdded(true);
        closePasswordForm();
      }
      setFeedback({
        section,
        text:
          section === 'profile' ? 'Perubahan profil disimpan.' : 'Password berhasil ditambahkan.',
      });
    } catch (error) {
      setFeedback({ section, text: getAuthErrorMessage(error), error: true });
    } finally {
      setBusy(null);
    }
  }

  function closePasswordForm() {
    setAddingPassword(false);
    setPassword('');
    setConfirmation('');
  }

  function sectionFeedback(section: 'profile' | 'password') {
    if (feedback?.section !== section) return null;
    if (feedback.error) return <AuthError message={feedback.text} />;
    return (
      <Text accessibilityLiveRegion="polite" style={styles.success}>
        {feedback.text}
      </Text>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            Data profil
          </Text>
          <AuthField
            label="Nama lengkap"
            value={name}
            onChangeText={(value) => setDraft((previous) => ({ ...previous, name: value }))}
            maxLength={100}
            autoComplete="name"
            editable={!busy}
          />
          {profile.role === 'praktikan' && (
            <AuthField
              label="NIM"
              value={nim}
              onChangeText={(value) => setDraft((previous) => ({ ...previous, nim: value }))}
              maxLength={30}
              autoCorrect={false}
              autoCapitalize="characters"
              editable={!busy}
            />
          )}
          <AuthButton
            title="Simpan perubahan"
            busy={busy === 'profile'}
            disabled={
              !!busy ||
              !name.trim() ||
              (profile.role === 'praktikan' && !nim.trim()) ||
              (name.trim() === profile.displayName &&
                nim.trim().toUpperCase() === (profile.nim ?? ''))
            }
            onPress={() => save('profile')}
          />
          {sectionFeedback('profile')}
        </View>

        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            Akun dan metode masuk
          </Text>
          <View style={styles.group}>
            <Text style={styles.label}>Email akun</Text>
            <Text selectable style={styles.value}>
              {user.email ?? 'Email tidak tersedia'}
            </Text>
          </View>
          <View style={styles.group}>
            <Text style={styles.label}>Metode terhubung</Text>
            <Text style={styles.value}>
              {[hasGoogle ? 'Google' : null, hasPassword ? 'Email dan password' : null]
                .filter(Boolean)
                .join(' · ') || 'Tidak tersedia'}
            </Text>
          </View>
          {currentMethod && (
            <Text style={styles.detail}>Sesi ini masuk dengan {currentMethod}.</Text>
          )}
          {hasGoogle &&
            !hasPassword &&
            (addingPassword ? (
              <View style={styles.passwordForm}>
                <AuthField
                  label="Password baru"
                  value={password}
                  onChangeText={setPassword}
                  passwordToggle
                  autoComplete="new-password"
                  editable={!busy}
                />
                <AuthField
                  label="Konfirmasi password"
                  value={confirmation}
                  onChangeText={setConfirmation}
                  passwordToggle
                  autoComplete="new-password"
                  editable={!busy}
                />
                <AuthButton
                  title="Simpan password"
                  busy={busy === 'password'}
                  disabled={!!busy || !password || !confirmation}
                  onPress={() => save('password')}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!!busy}
                  onPress={closePasswordForm}
                  style={styles.cancel}
                >
                  <Text style={styles.label}>Batal</Text>
                </Pressable>
              </View>
            ) : (
              <AuthButton
                title="Tambahkan password"
                disabled={!!busy}
                onPress={() => {
                  setFeedback(null);
                  setAddingPassword(true);
                }}
              />
            ))}
          {sectionFeedback('password')}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BrandColors.pageBackground },
  content: { padding: 16, paddingBottom: 28, gap: 16 },
  card: {
    gap: 14,
    backgroundColor: BrandColors.paper,
    borderRadius: 16,
    borderColor: BrandColors.line,
    borderWidth: 1,
    padding: 16,
  },
  title: { color: BrandColors.ink, fontSize: 19, fontWeight: '700' },
  group: { gap: 4 },
  label: { color: BrandColors.ink, fontSize: 13, fontWeight: '600' },
  value: { color: BrandColors.ink, fontSize: 16 },
  detail: { color: BrandColors.forest, fontSize: 14 },
  success: { color: BrandColors.forest, fontSize: 14, fontWeight: '600' },
  passwordForm: { gap: 12 },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});
