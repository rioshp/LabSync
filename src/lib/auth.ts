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
import { firebaseErrorCode } from './firebase-error';

function validEmail(email: string) {
  const value = email.trim();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Masukkan alamat email yang valid.');
  }
  return value;
}

function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 6 || !password.trim()) throw new Error('Password minimal 6 karakter.');
  if (password !== confirmation) throw new Error('Konfirmasi password tidak cocok.');
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
  validateNewPassword(password, confirmation);
  const { auth } = await import('./firebase');
  const { user } = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  await sendEmailVerification(user);
}

export async function addAccountPassword(password: string, confirmation: string) {
  validateNewPassword(password, confirmation);
  const { auth } = await import('./firebase');
  const user = auth.currentUser;
  if (
    !user?.email ||
    !user.emailVerified ||
    !user.providerData.some(({ providerId }) => providerId === 'google.com')
  ) {
    throw new Error('Masuk dengan akun Google yang terverifikasi untuk menambahkan password.');
  }
  if (user.providerData.some(({ providerId }) => providerId === 'password')) return;
  const apiKey = auth.app.options.apiKey;
  if (!apiKey) throw new Error('Konfigurasi Firebase tidak tersedia.');

  // Supplying the current ID token links the password to this UID, including
  // projects with Firebase email enumeration protection enabled.
  const idToken = await getIdToken(user);
  const response = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + encodeURIComponent(apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, email: user.email, password, returnSecureToken: true }),
    },
  );
  const result = await response.json();
  if (!response.ok) {
    const code: string = result.error?.message ?? '';
    if (
      code === 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' ||
      code === 'INVALID_ID_TOKEN' ||
      code === 'TOKEN_EXPIRED'
    ) {
      throw new Error('Masuk ulang dengan Google, lalu coba tambahkan password lagi.');
    }
    if (code.startsWith('WEAK_PASSWORD') || code.startsWith('PASSWORD_DOES_NOT_MEET')) {
      throw new Error('Gunakan password yang memenuhi persyaratan keamanan.');
    }
    throw new Error('Password belum bisa ditambahkan. Coba lagi.');
  }
  if (result.localId !== user.uid) throw new Error('Akun berubah. Silakan masuk lagi.');
  await reload(user);
}

export async function resetPassword(email: string) {
  const normalizedEmail = validEmail(email);
  const { auth } = await import('./firebase');
  try {
    await sendPasswordResetEmail(auth, normalizedEmail);
  } catch (error) {
    if (firebaseErrorCode(error) !== 'user-not-found') throw error;
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

export function getAuthErrorMessage(error: unknown): string {
  switch (firebaseErrorCode(error)) {
    case '10':
    case 'DEVELOPER_ERROR':
      return 'Konfigurasi Google Sign-In belum cocok dengan aplikasi Android ini. Hubungi pengelola.';
    case 'PLAY_SERVICES_NOT_AVAILABLE':
    case '9':
      return 'Google Play Services tidak tersedia. Periksa pembaruannya, lalu coba lagi.';
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
      return error instanceof Error && !firebaseErrorCode(error)
        ? error.message
        : 'Terjadi kesalahan. Silakan coba lagi.';
  }
}
