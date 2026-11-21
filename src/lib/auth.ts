import {
  createUserWithEmailAndPassword,
  getIdToken,
  GoogleAuthProvider,
  linkWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type AuthCredential,
  type User,
} from '@react-native-firebase/auth';
import { Platform } from 'react-native';

import type { UserProfile } from '@/types/user';

import googleServices from '../../google-services.json';

function validEmail(email: string) {
  const value = email.trim();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Masukkan alamat email yang valid.');
  }
  return value;
}

export async function login(email: string, password: string, googleCredential?: AuthCredential) {
  const normalizedEmail = validEmail(email);
  if (!password.trim()) throw new Error('Password wajib diisi.');
  const { auth } = await import('./firebase');
  const { user } = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  if (googleCredential) {
    try {
      await linkWithCredential(user, googleCredential);
    } catch (error) {
      await signOut(auth);
      throw error;
    }
  }
}

export async function register(email: string, password: string, confirmation: string) {
  const normalizedEmail = validEmail(email);
  if (password.length < 6 || !password.trim()) throw new Error('Password minimal 6 karakter.');
  if (password !== confirmation) throw new Error('Konfirmasi password tidak cocok.');
  const { auth } = await import('./firebase');
  const { user } = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  await sendEmailVerification(user);
}

export async function resetPassword(email: string) {
  const normalizedEmail = validEmail(email);
  const { auth } = await import('./firebase');
  try {
    await sendPasswordResetEmail(auth, normalizedEmail);
  } catch (error) {
    if (authCode(error) !== 'user-not-found') throw error;
  }
}

export async function refreshVerification(user: User) {
  const { auth } = await import('./firebase');
  await reload(user);
  const refreshed = auth.currentUser;
  if (refreshed?.uid !== user.uid) throw new Error('Sesi akun berubah. Silakan masuk lagi.');
  await getIdToken(refreshed, true);
  return refreshed.emailVerified;
}

export async function logout() {
  const { auth } = await import('./firebase');
  await signOut(auth);
}

export async function getGoogleCredential() {
  if (Platform.OS === 'web') throw new Error('Gunakan build perangkat untuk masuk dengan Google.');
  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    googleServices.client
      .flatMap((client) => client.oauth_client ?? [])
      .find((client) => client.client_type === 3)?.client_id;
  if (!webClientId) throw new Error('Google Sign-In belum dikonfigurasi untuk build ini.');
  const { GoogleSignin, isSuccessResponse } = await import(
    '@react-native-google-signin/google-signin'
  );
  GoogleSignin.configure({ webClientId });
  if (Platform.OS === 'android')
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result)) return null;
  if (!result.data.idToken)
    throw new Error('Google tidak mengembalikan kredensial yang dapat digunakan.');
  return {
    credential: GoogleAuthProvider.credential(result.data.idToken),
    email: result.data.user.email,
  };
}

export async function loginWithGoogle(credential: AuthCredential) {
  const { auth } = await import('./firebase');
  await signInWithCredential(auth, credential);
}

export function parseUserProfile(data: Record<string, unknown> | undefined): UserProfile | null {
  if (
    !data ||
    typeof data.displayName !== 'string' ||
    !data.displayName.trim() ||
    (data.accountStatus !== 'active' && data.accountStatus !== 'disabled')
  )
    return null;
  const { displayName, accountStatus } = data;
  const profile: Pick<UserProfile, 'displayName' | 'accountStatus'> = {
    displayName,
    accountStatus,
  };
  if (data.role === 'asisten' && data.nim === null)
    return { ...profile, role: 'asisten', nim: null };
  if (data.role === 'praktikan' && typeof data.nim === 'string' && data.nim.trim()) {
    return { ...profile, role: 'praktikan', nim: data.nim };
  }
  return null;
}

export function authCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code).split('/').pop()
    : '';
}

export function getAuthErrorMessage(error: unknown): string {
  switch (authCode(error)) {
    case 'email-already-in-use':
      return 'Email sudah terdaftar. Silakan masuk.';
    case 'invalid-email':
      return 'Format email tidak valid.';
    case 'weak-password':
      return 'Password belum memenuhi persyaratan keamanan.';
    case 'user-not-found':
    case 'wrong-password':
    case 'invalid-credential':
      return 'Kredensial tidak valid. Periksa login dan coba lagi.';
    case 'user-disabled':
      return 'Akun dinonaktifkan. Hubungi pengelola.';
    case 'too-many-requests':
      return 'Terlalu banyak percobaan. Silakan coba lagi nanti.';
    case 'network-request-failed':
    case 'unavailable':
      return 'Tidak dapat terhubung. Periksa koneksi internet dan coba lagi.';
    case 'permission-denied':
      return 'Akses profil ditolak. Hubungi pengelola.';
    case 'operation-not-allowed':
      return 'Metode masuk ini belum diaktifkan oleh pengelola.';
    case 'credential-already-in-use':
      return 'Akun Google ini sudah terhubung ke akun lain. Hubungi pengelola.';
    default:
      return error instanceof Error && !authCode(error)
        ? error.message
        : 'Terjadi kesalahan. Silakan coba lagi.';
  }
}
