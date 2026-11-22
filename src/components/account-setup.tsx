import { sendEmailVerification } from '@react-native-firebase/auth';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthButton, AuthError, AuthField, AuthScreen, authStyles } from '@/components/auth-screen';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { getAuthErrorMessage, logout, refreshVerification } from '@/lib/auth';
import { mutationError } from '@/lib/mutations';
import { completeProfile } from '@/lib/profile';

export function AccountSetup() {
  const { user, phase, retry } = useAuth();
  const [name, setName] = useState(user?.displayName ?? '');
  const [nim, setNim] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  async function run(action: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(action);
    setError(null);
    setNotice('');
    try {
      await fn();
    } catch (error) {
      setError(action === 'setup' ? mutationError(error) : getAuthErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (!user) return null;
  const verifying = phase === 'verify';
  const disabled = phase === 'disabled';
  const title = disabled
    ? 'Akun dinonaktifkan.'
    : verifying
      ? 'Verifikasi email.'
      : 'Lengkapi profil.';
  const description = disabled
    ? 'Hubungi pengelola LabSync untuk memeriksa akses akun ini.'
    : verifying
      ? 'Buka tautan verifikasi di email, lalu kembali ke LabSync.'
      : 'Isi nama lengkap dan NIM untuk mengaktifkan akun praktikan.';

  return (
    <AuthScreen
      header="clean"
      stepLabel={disabled ? undefined : verifying ? '01 / 02' : '02 / 02'}
      dangerBadge={disabled}
      title={title}
      description={description}
    >
      <View style={authStyles.form}>
        {verifying ? (
          <>
            <View style={styles.emailPill}>
              <SymbolView
                name={{ ios: 'envelope', android: 'mail_outline', web: 'mail_outline' }}
                size={16}
                tintColor={BrandColors.ink}
              />
              <Text style={styles.emailText}>{user.email}</Text>
            </View>
            <AuthButton
              title="Saya sudah verifikasi"
              busy={busy === 'verify'}
              disabled={!!busy}
              onPress={() =>
                run('verify', async () => {
                  const verified = await refreshVerification(user);
                  if (!verified)
                    setNotice('Verifikasi belum terdeteksi. Periksa email lalu coba lagi.');
                  else retry();
                })
              }
            />
            <AuthButton
              title="Kirim ulang tautan"
              variant="outline"
              busy={busy === 'email'}
              disabled={!!busy}
              onPress={() =>
                run('email', async () => {
                  await sendEmailVerification(user);
                  setNotice('Tautan verifikasi dikirim. Periksa kotak masuk dan spam.');
                })
              }
            />
          </>
        ) : null}
        {!verifying && !disabled ? (
          <>
            <AuthField
              label="Nama lengkap"
              icon="user"
              value={name}
              onChangeText={setName}
              placeholder="Contoh: Budi Santoso"
              maxLength={100}
              autoComplete="name"
              editable={!busy}
            />
            <AuthField
              label="NIM"
              icon="id"
              value={nim}
              onChangeText={setNim}
              placeholder="Contoh: 23051204008"
              maxLength={30}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
            />
            <AuthButton
              title="Simpan profil"
              busy={busy === 'setup'}
              disabled={!!busy || !name.trim() || !nim.trim()}
              onPress={() =>
                run('setup', async () => {
                  await completeProfile(name, nim);
                  retry();
                })
              }
            />
          </>
        ) : null}
        {notice ? (
          <View style={styles.noticeBox}>
            <Text accessibilityLiveRegion="polite" style={styles.noticeText}>
              {notice}
            </Text>
          </View>
        ) : null}
        <AuthError message={error} />
        <AuthButton
          title="Keluar"
          variant={disabled ? 'danger' : 'soft'}
          disabled={!!busy}
          busy={busy === 'logout'}
          onPress={() => run('logout', logout)}
        />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  emailPill: {
    backgroundColor: BrandColors.pageBackground,
    borderWidth: 1,
    borderColor: BrandColors.line,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  emailText: {
    color: BrandColors.ink,
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  noticeBox: {
    backgroundColor: BrandColors.soft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    color: BrandColors.ink,
    fontSize: 13,
    lineHeight: 19,
  },
});
