import { doc, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';

import { createId, firestoreSession, readId, readText } from './firestore-input';

export async function changeClass(
  action: 'createClass' | 'updateClass' | 'archiveClass',
  fields: Record<string, unknown>,
) {
  const { db, uid } = await firestoreSession();

  const creating = action === 'createClass';
  const archiving = action === 'archiveClass';
  const classId = creating ? createId(uid, fields.requestId) : readId(fields.classId, 'Kelas');
  const name = archiving ? '' : readText(fields.name, 'Nama kelas', 1, 100);
  const timeZone = archiving ? '' : readText(fields.timeZone, 'Zona waktu', 1, 100);
  if (!archiving) {
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format(0);
    } catch {
      throw new Error('Masukkan zona waktu IANA yang valid, misalnya Asia/Jakarta.');
    }
  }

  const ref = doc(db, 'classes', classId);
  return runTransaction(db, async (transaction) => {
    const existing = (await transaction.get(ref)).data();
    if (creating && existing) {
      if (
        existing.name === name &&
        existing.timeZone === timeZone &&
        existing.practicumId === null
      ) {
        return { id: classId };
      }
      throw new Error('Permintaan ini sudah dipakai. Buka kembali formulir kelas.');
    }
    if (!creating && !existing) throw new Error('Kelas tidak ditemukan.');
    if (archiving && existing?.status === 'archived') return { archived: true };
    if (existing && existing.status !== 'active') throw new Error('Kelas sudah diarsipkan.');

    const timestamp = serverTimestamp();
    if (creating) {
      transaction.set(ref, {
        practicumId: null,
        practicumName: name,
        assistantUid: uid,
        name,
        timeZone,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        unfinishedSessionCount: 0,
      });
      return { id: classId };
    }
    // Kelas lama masih terikat ke penghitung kelas di dokumen induknya.
    const practicumId = existing?.practicumId;
    const practicumRef = practicumId ? doc(db, 'practicums', practicumId) : null;
    const practicum = practicumRef ? (await transaction.get(practicumRef)).data() : null;
    if (practicumRef && practicum?.status !== 'active') throw new Error('Praktikum tidak aktif.');

    if (archiving) {
      if (existing?.unfinishedSessionCount !== 0) {
        throw new Error('Selesaikan atau batalkan semua sesi sebelum mengarsipkan kelas.');
      }
      transaction.update(ref, { status: 'archived', archivedAt: timestamp, updatedAt: timestamp });
      if (practicumRef && practicum) {
        transaction.update(practicumRef, {
          activeClassCount: practicum.activeClassCount - 1,
          lastClassChangeId: classId,
          updatedAt: timestamp,
        });
      }
      return { archived: true };
    }
    transaction.update(ref, {
      name,
      timeZone,
      ...(practicumId ? {} : { practicumName: name }),
      updatedAt: timestamp,
    });
    return { updated: true };
  });
}
