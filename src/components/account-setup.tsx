import { sendEmailVerification } from '@react-native-firebase/auth';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthButton, AuthError, AuthField, AuthScreen, authStyles } from '@/components/auth-screen';
import { useAuth } from '@/hooks/useAuth';
import { getAuthErrorMessage, logout, refreshVerification } from '@/lib/auth';
import { mutate, mutationError } from '@/lib/mutations';

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
      : 'Isi nama dan NIM untuk mengaktifkan akun praktikan.';

  return (
    <AuthScreen title={title} description={description}>
      <View style={authStyles.form}>
        {verifying && (
          <>
            <Text style={authStyles.label}>{user.email}</Text>
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
        )}
        {!verifying && !disabled && (
          <>
            <AuthField
              label="Nama lengkap"
              value={name}
              onChangeText={setName}
              maxLength={100}
              autoComplete="name"
              editable={!busy}
            />
            <AuthField
              label="NIM"
              value={nim}
              onChangeText={setNim}
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
                  await mutate('completeProfile', { displayName: name.trim(), nim: nim.trim() });
                  retry();
                })
              }
            />
          </>
        )}
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={authStyles.label}>
            {notice}
          </Text>
        ) : null}
        <AuthError message={error} />
        <AuthButton
          title="Keluar"
          disabled={!!busy}
          busy={busy === 'logout'}
          onPress={() => run('logout', logout)}
        />
      </View>
    </AuthScreen>
  );
}
