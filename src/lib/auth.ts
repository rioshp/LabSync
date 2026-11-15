import { createUserWithEmailAndPassword, deleteUser, signInWithEmailAndPassword, signOut } from '@react-native-firebase/auth';
import { doc, serverTimestamp, setDoc, Timestamp } from '@react-native-firebase/firestore';

import type { Role, UserProfile } from '@/types/user';

type RegistrationInput = {
  name: string;
  nim: string;
  role: Role;
  email: string;
  password: string;
  confirmPassword: string;
};

function validateLogin(email: string, password: string): string | null {
  if (!email.trim() || !password.trim()) return 'Email dan password wajib diisi.';
  if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Format email tidak valid.';
  }
  return null;
}

function validateRegistration(input: RegistrationInput): string | null {
  if (!input.name.trim() || input.name.trim().length > 100) return 'Nama wajib diisi, maksimal 100 karakter.';
  if (input.role !== 'asisten' && input.role !== 'praktikan') return 'Pilih peran yang sesuai.';
  if (input.role === 'praktikan' && (!input.nim.trim() || input.nim.trim().length > 30)) {
    return 'NIM wajib diisi untuk praktikan, maksimal 30 karakter.';
  }
  const loginError = validateLogin(input.email, input.password);
  if (loginError) return loginError;
  if (input.password.length < 6) return 'Password minimal 6 karakter.';
  if (input.password !== input.confirmPassword) return 'Konfirmasi password tidak cocok.';
  return null;
}

export async function login(email: string, password: string) {
  const error = validateLogin(email, password);
  if (error) throw new Error(error);
  const { auth } = await import('./firebase');
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function logout(): Promise<void> {
  const { auth } = await import('./firebase');
  await signOut(auth);
}

export async function register(input: RegistrationInput): Promise<void> {
  const error = validateRegistration(input);
  if (error) throw new Error(error);

  const { auth, db } = await import('./firebase');
  const { user } = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
  try {
    await setDoc(doc(db, 'users', user.uid), {
      name: input.name.trim(),
      role: input.role,
      ...(input.role === 'praktikan' ? { nim: input.nim.trim() } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (profileError) {
    // Auth and Firestore are separate services; undo the new account if its profile cannot be saved.
    try {
      await deleteUser(user);
    } catch {
      throw new Error('Akun sudah dibuat, tetapi profil gagal disimpan. Hubungi pengelola untuk melengkapi profil akun ini.');
    }
    throw profileError;
  }
}

export function parseUserProfile(data: Record<string, unknown> | undefined): UserProfile | null {
  if (
    !data || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100 ||
    !(data.createdAt instanceof Timestamp)
  ) {
    return null;
  }

  const profile = { name: data.name, createdAt: data.createdAt };
  if (data.role === 'asisten' && data.nim === undefined) {
    return { ...profile, role: 'asisten' };
  }
  if (data.role === 'praktikan' && typeof data.nim === 'string' && data.nim.trim() && data.nim.length <= 30) {
    return { ...profile, role: 'praktikan', nim: data.nim };
  }
  return null;
}

export function getAuthErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  switch (code) {
    case 'auth/email-already-in-use': return 'Email sudah terdaftar. Silakan masuk.';
    case 'auth/invalid-email': return 'Format email tidak valid.';
    case 'auth/weak-password': return 'Password belum memenuhi persyaratan keamanan.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Email atau password salah.';
    case 'auth/user-disabled': return 'Akun dinonaktifkan. Hubungi pengelola.';
    case 'auth/too-many-requests': return 'Terlalu banyak percobaan. Silakan coba lagi nanti.';
    case 'auth/network-request-failed':
    case 'firestore/unavailable': return 'Tidak dapat terhubung. Periksa koneksi internet dan coba lagi.';
    case 'firestore/permission-denied': return 'Akses profil ditolak. Hubungi pengelola untuk memeriksa izin akses.';
    case 'auth/operation-not-allowed': return 'Login email dan password belum diaktifkan oleh pengelola.';
    default: return error instanceof Error && !code
      ? error.message
      : 'Terjadi kesalahan. Silakan coba lagi.';
  }
}
