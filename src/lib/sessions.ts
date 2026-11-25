import { doc, runTransaction, serverTimestamp, Timestamp } from '@react-native-firebase/firestore';
import { createId, firestoreSession, readId, readText } from './firestore-input';
import { readCoordinates, readRadius } from './location';

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
  if (typeof fields.labId !== 'string' || !fields.labId.trim()) {
    throw new Error('Pilih laboratorium terlebih dahulu.');
  }
  const labId = readId(fields.labId, 'Laboratorium');
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
    labId,
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
    const projection = (await tx.get(doc(db, 'labSchedules', sessionId))).data();
    if (projection && projection.classId !== classId) {
      throw new Error('ID sesi sudah digunakan oleh kelas lain. Buka kembali formulir sesi.');
    }
    if (!classData || classData.assistantUid !== uid) throw new Error('Kelas tidak dapat diakses.');
    if (action === 'createSession' && session && schedule) {
      if (
        Object.entries(schedule).every(([key, value]) =>
          value instanceof Timestamp
            ? session[key]?.toMillis() === value.toMillis()
            : session[key] === value,
        )
      )
        return { id: sessionId };
      throw new Error('Permintaan ini sudah dipakai. Buka kembali formulir sesi.');
    }
    if (classData.status !== 'active') throw new Error('Kelas sudah diarsipkan.');
    if (action !== 'createSession' && (!session || session.assistantUid !== uid))
      throw new Error('Sesi tidak ditemukan.');
    if (
      !schedule &&
      action !== 'createSession' &&
      action !== 'updateSession' &&
      session?.status === transitions[action].to
    ) {
      return { status: transitions[action].to };
    }
    const labId = schedule?.labId ?? session?.labId;
    if (schedule || action === 'openSession') {
      if (typeof labId !== 'string' || !labId)
        throw new Error('Pilih laboratorium sebelum membuka sesi.');
      const lab = (await tx.get(doc(db, 'labs', labId))).data();
      if (!lab || lab.status !== 'active')
        throw new Error('Laboratorium tidak aktif. Pilih laboratorium lain.');
      readCoordinates(lab);
      readRadius(lab.radiusMeters);
    }
    const timestamp = serverTimestamp();
    // Publish safe map data with the source session; never expose private class collections.
    function publish(next: Record<string, unknown>) {
      if (typeof next.labId !== 'string') return; // Historical sessions may not have a lab yet.
      tx.set(doc(db, 'labSchedules', sessionId), {
        classId,
        sessionId,
        assistantUid: uid,
        labId: next.labId,
        practicumName: classData!.practicumName,
        className: classData!.name,
        timeZone: classData!.timeZone,
        moduleTitle: next.moduleTitle,
        startsAt: next.startsAt,
        endsAt: next.endsAt,
        status: next.status,
        updatedAt: timestamp,
      });
    }
    if (action === 'createSession' && schedule) {
      const next = {
        ...schedule,
        assistantUid: uid,
        status: 'scheduled',
        openedAt: null,
        closedAt: null,
        cancelledAt: null,
        pendingPermitCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      tx.set(ref, next);
      tx.update(classRef, {
        unfinishedSessionCount: classData.unfinishedSessionCount + 1,
        lastSessionChangeId: sessionId,
        updatedAt: timestamp,
      });
      publish(next);
      return { id: sessionId };
    }
    if (action === 'updateSession' && schedule) {
      if (session!.status !== 'scheduled')
        throw new Error('Hanya sesi terjadwal yang bisa diubah.');
      tx.update(ref, { ...schedule, updatedAt: timestamp });
      publish({ ...session, ...schedule });
      return { updated: true };
    }
    if (action === 'createSession' || action === 'updateSession')
      throw new Error('Jadwal sesi tidak valid.');
    const transition = transitions[action];
    if (session!.status !== transition.from) throw new Error('Status sesi sudah berubah.');
    if (action === 'cancelSession' && session!.pendingPermitCount !== 0)
      throw new Error('Putuskan izin yang tertunda sebelum membatalkan sesi.');
    if (action !== 'openSession') {
      if (classData.unfinishedSessionCount < 1)
        throw new Error('Penghitung sesi kelas tidak cocok. Hubungi pengelola.');
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
    publish({ ...session, status: transition.to });
    return { status: transition.to };
  });
}
