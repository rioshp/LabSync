import { doc, runTransaction, serverTimestamp, Timestamp } from '@react-native-firebase/firestore';

import { createId, firestoreSession, readId, readText } from './firestore-input';

export type SessionAction =
  | 'createSession'
  | 'updateSession'
  | 'openSession'
  | 'closeSession'
  | 'cancelSession';

const transitions = {
  openSession: { from: 'scheduled', to: 'open', timestamp: 'openedAt' },
  closeSession: { from: 'open', to: 'closed', timestamp: 'closedAt' },
  cancelSession: { from: 'scheduled', to: 'cancelled', timestamp: 'cancelledAt' },
} as const;

function sessionSchedule(fields: Record<string, unknown>) {
  const moduleTitle = readText(fields.moduleTitle, 'Topik', 1, 120);
  const room = readText(fields.room, 'Ruang', 1, 120);
  const { startsAt, endsAt } = fields;
  if (
    typeof startsAt !== 'number' ||
    !Number.isSafeInteger(startsAt) ||
    startsAt < 0 ||
    typeof endsAt !== 'number' ||
    !Number.isSafeInteger(endsAt) ||
    endsAt <= startsAt
  ) {
    throw new Error('Waktu selesai harus setelah waktu mulai.');
  }
  return {
    moduleTitle,
    room,
    startsAt: Timestamp.fromMillis(startsAt),
    endsAt: Timestamp.fromMillis(endsAt),
  };
}

export async function changeSession(action: SessionAction, fields: Record<string, unknown>) {
  const { db, uid } = await firestoreSession();

  const classId = readId(fields.classId, 'Kelas');
  const sessionId =
    action === 'createSession' ? createId(uid, fields.requestId) : readId(fields.sessionId, 'Sesi');
  const classRef = doc(db, 'classes', classId);
  const ref = doc(db, 'classes', classId, 'sessions', sessionId);
  const schedule =
    action === 'createSession' || action === 'updateSession' ? sessionSchedule(fields) : null;

  return runTransaction(db, async (tx) => {
    const classData = (await tx.get(classRef)).data();
    const session = (await tx.get(ref)).data();
    if (!classData || classData.assistantUid !== uid) throw new Error('Kelas tidak dapat diakses.');

    const timestamp = serverTimestamp();
    if (action === 'createSession' && schedule) {
      if (session) {
        if (
          session.moduleTitle === schedule.moduleTitle &&
          session.room === schedule.room &&
          session.startsAt?.toMillis() === schedule.startsAt.toMillis() &&
          session.endsAt?.toMillis() === schedule.endsAt.toMillis()
        )
          return { id: sessionId };
        throw new Error('Permintaan ini sudah dipakai. Buka kembali formulir sesi.');
      }
      if (classData.status !== 'active') throw new Error('Kelas sudah diarsipkan.');
      tx.set(ref, {
        ...schedule,
        assistantUid: uid,
        status: 'scheduled',
        openedAt: null,
        closedAt: null,
        cancelledAt: null,
        pendingPermitCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      tx.update(classRef, {
        unfinishedSessionCount: classData.unfinishedSessionCount + 1,
        lastSessionChangeId: sessionId,
        updatedAt: timestamp,
      });
      return { id: sessionId };
    }

    if (!session || session.assistantUid !== uid) throw new Error('Sesi tidak ditemukan.');
    if (classData.status !== 'active') throw new Error('Kelas sudah diarsipkan.');
    if (action === 'updateSession' && schedule) {
      if (session.status !== 'scheduled') throw new Error('Hanya sesi terjadwal yang bisa diubah.');
      tx.update(ref, { ...schedule, updatedAt: timestamp });
      return { updated: true };
    }

    if (action === 'createSession' || action === 'updateSession') {
      throw new Error('Jadwal sesi tidak valid.');
    }
    const transition = transitions[action];
    if (session.status === transition.to) return { status: transition.to };
    if (session.status !== transition.from) throw new Error('Status sesi sudah berubah.');
    if (action === 'cancelSession' && session.pendingPermitCount !== 0) {
      throw new Error('Putuskan izin yang tertunda sebelum membatalkan sesi.');
    }
    if (action !== 'openSession') {
      if (classData.unfinishedSessionCount < 1) {
        throw new Error('Penghitung sesi kelas tidak cocok. Hubungi pengelola.');
      }
      tx.update(classRef, {
        unfinishedSessionCount: classData.unfinishedSessionCount - 1,
        lastSessionChangeId: sessionId,
        updatedAt: timestamp,
      });
    }
    tx.update(ref, {
      status: transition.to,
      [transition.timestamp]: timestamp,
      updatedAt: timestamp,
    });
    return { status: transition.to };
  });
}
