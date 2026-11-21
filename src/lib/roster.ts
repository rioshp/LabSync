import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
} from '@react-native-firebase/firestore';

import { firestoreSession, readId, readNim, readText } from './firestore-input';

export async function lookupStudent(fields: Record<string, unknown>) {
  const { db, uid } = await firestoreSession();
  const classId = readId(fields.classId, 'Kelas');
  const nim = readNim(fields.nim);
  const lookupRef = doc(db, 'studentLookups', uid);
  await runTransaction(db, async (tx) => {
    const previous = (await tx.get(lookupRef)).data();
    const start = previous?.windowStartedAt;
    const inWindow = start && Date.now() - start.toMillis() < 60_000;
    if (inWindow && previous.count >= 20) {
      throw new Error('Batas pencarian peserta tercapai. Coba lagi dalam satu menit.');
    }
    const timestamp = serverTimestamp();
    tx.set(lookupRef, {
      classId,
      nim,
      windowStartedAt: inWindow ? start : timestamp,
      count: inWindow ? previous.count + 1 : 1,
      updatedAt: timestamp,
    });
  });

  const empty = { studentUid: null, displayName: null, nim: null };
  const key = (await getDocFromServer(doc(db, 'studentKeys', nim))).data();
  if (!key) return empty;

  const studentUid = readId(key.studentUid, 'Peserta');
  try {
    const student = (await getDocFromServer(doc(db, 'users', studentUid))).data();
    if (
      student?.role === 'praktikan' &&
      student.accountStatus === 'active' &&
      student.nim === nim
    ) {
      return { studentUid, displayName: student.displayName, nim };
    }
    return empty;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      String(error.code).split('/').pop() === 'permission-denied'
    )
      return empty;
    throw error;
  }
}

export async function changeEnrollment(
  action: 'addStudent' | 'removeStudent',
  fields: Record<string, unknown>,
) {
  const { db, uid } = await firestoreSession();
  const classId = readId(fields.classId, 'Kelas');
  const studentUid = readId(fields.studentUid, 'Peserta');
  const ref = doc(db, 'enrollments', `${classId}~${studentUid}`);

  return runTransaction(db, async (tx) => {
    const existing = (await tx.get(ref)).data();
    const timestamp = serverTimestamp();
    if (action === 'removeStudent') {
      if (!existing) throw new Error('Peserta tidak ditemukan dalam kelas.');
      if (existing.status === 'removed') return { removed: false };
      tx.update(ref, { status: 'removed', removedAt: timestamp, updatedAt: timestamp });
      return { removed: true };
    }
    if (existing?.status === 'active') return { studentUid, added: false };
    const nim = readNim(fields.nim);
    const displayName = readText(fields.displayName, 'Nama peserta', 1, 100);
    tx.set(ref, {
      classId,
      assistantUid: uid,
      studentUid,
      studentNameSnapshot: displayName,
      nimSnapshot: nim,
      status: 'active',
      joinedAt: timestamp,
      updatedAt: timestamp,
      removedAt: null,
    });
    return { studentUid, added: true };
  });
}
