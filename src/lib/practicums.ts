import {
  collection,
  doc,
  getDocsFromServer,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from '@react-native-firebase/firestore';

import { createId, firestoreSession, readId, readText } from './firestore-input';

export async function createPracticum(fields: Record<string, unknown>) {
  const name = readText(fields.name, 'Nama praktikum', 1, 100);
  const { db, uid } = await firestoreSession();

  // Reuse the document ID after a retry.
  const ref = doc(db, 'practicums', createId(uid, fields.requestId));
  await runTransaction(db, async (transaction) => {
    const existing = (await transaction.get(ref)).data();
    if (existing) {
      if (existing.name === name) return;
      throw new Error('Permintaan ini sudah dipakai. Buka kembali formulir praktikum.');
    }
    const timestamp = serverTimestamp();
    transaction.set(ref, {
      name,
      assistantUid: uid,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      activeClassCount: 0,
      totalClassCount: 0,
    });
  });
  return { id: ref.id };
}

export async function changePracticum(
  action: 'updatePracticum' | 'archivePracticum',
  fields: Record<string, unknown>,
) {
  const practicumId = readId(fields.practicumId, 'Praktikum');
  const { db, uid } = await firestoreSession();
  const name =
    action === 'updatePracticum' ? readText(fields.name, 'Nama praktikum', 1, 100) : null;
  const ref = doc(db, 'practicums', practicumId);
  const classQuery = query(
    collection(db, 'classes'),
    where('assistantUid', '==', uid),
    where('practicumId', '==', practicumId),
  );
  const classes = name ? await getDocsFromServer(classQuery) : null;

  return runTransaction(db, async (transaction) => {
    const existing = (await transaction.get(ref)).data();
    if (!existing) throw new Error('Praktikum tidak ditemukan.');
    if (action === 'archivePracticum') {
      if (existing.status === 'archived') return { archived: true };
      if (existing.activeClassCount !== 0) throw new Error('Arsipkan kelas aktif terlebih dahulu.');
      const timestamp = serverTimestamp();
      transaction.update(ref, {
        status: 'archived',
        archivedAt: timestamp,
        updatedAt: timestamp,
      });
      return { archived: true };
    }
    if (existing.status !== 'active') throw new Error('Praktikum sudah diarsipkan.');
    if (existing.name === name) return { updated: false };
    if (!classes || classes.size !== existing.totalClassCount) {
      throw new Error('Daftar kelas berubah. Muat ulang dan coba lagi.');
    }
    const timestamp = serverTimestamp();
    transaction.update(ref, { name, updatedAt: timestamp });
    for (const item of classes.docs) {
      transaction.update(item.ref, { practicumName: name, updatedAt: timestamp });
    }
    return { updated: true };
  });
}
