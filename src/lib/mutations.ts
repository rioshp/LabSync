import { getIdToken } from '@react-native-firebase/auth';
import { httpsCallable } from '@react-native-firebase/functions';
import { randomUUID } from 'expo-crypto';

export function newRequestId() {
  return randomUUID();
}

export async function mutate<T = unknown>(
  action: string,
  fields: Record<string, unknown> = {},
): Promise<T> {
  const { auth, functions } = await import('./firebase');
  if (!auth.currentUser) throw new Error('Silakan masuk lagi.');
  if (action === 'completeProfile') await getIdToken(auth.currentUser, true);
  const call = httpsCallable<Record<string, unknown>, T>(functions, 'mutate');
  return (await call({ ...fields, action })).data;
}

export function mutationError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code).split('/').pop()
      : '';
  if (['unavailable', 'deadline-exceeded', 'network-request-failed'].includes(code ?? '')) {
    return 'Server belum dapat dihubungi. Periksa koneksi lalu coba lagi.';
  }
  if (code === 'unauthenticated') return 'Sesi akun tidak tersedia. Silakan masuk lagi.';
  if (code === 'permission-denied') return 'Akun kamu tidak memiliki akses untuk tindakan ini.';
  if (
    [
      'already-exists',
      'invalid-argument',
      'failed-precondition',
      'not-found',
      'resource-exhausted',
    ].includes(code ?? '') &&
    error instanceof Error
  )
    return error.message;
  if (!code && error instanceof Error) return error.message;
  return 'Tindakan belum berhasil. Silakan coba lagi.';
}
