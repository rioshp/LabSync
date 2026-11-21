import { getIdToken } from '@react-native-firebase/auth';
import { doc, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';

import { firebaseErrorCode } from './firebase-error';
import { firestoreSession, readNim, readText } from './firestore-input';

export async function completeProfile(name: string, studentNumber: string) {
  const displayName = readText(name, 'Nama lengkap', 1, 100);
  const nim = readNim(studentNumber);
  const { db, user } = await firestoreSession();
  await getIdToken(user, true);

  const profileRef = doc(db, 'users', user.uid);
  const keyRef = doc(db, 'studentKeys', nim);
  try {
    await runTransaction(db, async (transaction) => {
      const existing = (await transaction.get(profileRef)).data();
      if (existing) {
        const matches =
          existing.role === 'praktikan' &&
          existing.accountStatus === 'active' &&
          existing.displayName === displayName &&
          existing.nim === nim;
        if (matches) return;
        throw new Error('Akun ini sudah memiliki profil.');
      }
      const timestamp = serverTimestamp();
      transaction.set(profileRef, {
        displayName,
        role: 'praktikan',
        accountStatus: 'active',
        nim,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.set(keyRef, { studentUid: user.uid, createdAt: timestamp });
    });
  } catch (error) {
    if (firebaseErrorCode(error) === 'permission-denied') {
      throw new Error('Profil ditolak. Pastikan email sudah terverifikasi dan NIM belum dipakai.');
    }
    throw error;
  }
}

export async function updateAccountProfile(name: string, studentNumber: string) {
  const displayName = readText(name, 'Nama lengkap', 1, 100);
  const { db, user } = await firestoreSession();
  const profileRef = doc(db, 'users', user.uid);

  try {
    await runTransaction(db, async (transaction) => {
      const profile = (await transaction.get(profileRef)).data();
      if (!profile || profile.accountStatus !== 'active') {
        throw new Error('Profil aktif tidak ditemukan.');
      }
      const nim = profile.role === 'praktikan' ? readNim(studentNumber) : null;
      if (profile.displayName === displayName && profile.nim === nim) return;

      const timestamp = serverTimestamp();
      if (nim && nim !== profile.nim) {
        transaction.set(doc(db, 'studentKeys', nim), {
          studentUid: user.uid,
          createdAt: timestamp,
        });
        transaction.delete(doc(db, 'studentKeys', profile.nim));
      }
      transaction.update(profileRef, { displayName, nim, updatedAt: timestamp });
    });
  } catch (error) {
    if (firebaseErrorCode(error) === 'permission-denied') {
      throw new Error('Profil tidak bisa disimpan. Pastikan NIM belum dipakai akun lain.');
    }
    throw error;
  }
}
