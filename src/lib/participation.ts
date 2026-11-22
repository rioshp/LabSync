import { doc, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';

import { firestoreSession, readId, readText } from './firestore-input';

export async function recordParticipation(
  action: 'checkIn' | 'submitPermit',
  fields: Record<string, unknown>,
) {
  const { db, uid } = await firestoreSession();
  const classId = readId(fields.classId, 'Kelas');
  const sessionId = readId(fields.sessionId, 'Sesi');
  const id = `${sessionId}~${uid}`;
  const submittingPermit = action === 'submitPermit';
  const reason = submittingPermit ? readText(fields.reason, 'Alasan izin', 10, 1000) : '';

  const classRef = doc(db, 'classes', classId);
  const sessionRef = doc(db, 'classes', classId, 'sessions', sessionId);
  const attendanceRef = doc(db, 'attendances', id);
  const permitRef = doc(db, 'permits', id);

  return runTransaction(db, async (tx) => {
    const attendance = (await tx.get(attendanceRef)).data();
    if (attendance) {
      if (submittingPermit) throw new Error('Kehadiran sudah tercatat untuk sesi ini.');
      return { id, checkedInAt: attendance.checkedInAt?.toMillis() };
    }
    const permit = (await tx.get(permitRef)).data();
    if (submittingPermit && permit) throw new Error('Izin sudah diajukan untuk sesi ini.');
    if (!submittingPermit && (permit?.status === 'pending' || permit?.status === 'approved')) {
      throw new Error('Izin yang menunggu atau sudah disetujui menghalangi presensi.');
    }

    const classData = (await tx.get(classRef)).data();
    const session = (await tx.get(sessionRef)).data();
    const student = (await tx.get(doc(db, 'users', uid))).data();
    if (!classData || !session || !student) throw new Error('Data sesi tidak tersedia.');
    if (submittingPermit && !['scheduled', 'open'].includes(session.status)) {
      throw new Error('Izin hanya bisa diajukan sebelum sesi selesai.');
    }
    if (!submittingPermit && session.status !== 'open') {
      throw new Error('Presensi hanya tersedia saat sesi dibuka.');
    }

    const timestamp = serverTimestamp();
    const participation = {
      classId,
      sessionId,
      assistantUid: classData.assistantUid,
      studentUid: uid,
      studentNameSnapshot: student.displayName,
      nimSnapshot: student.nim,
      sessionSnapshot: {
        practicumName: classData.practicumName,
        className: classData.name,
        moduleTitle: session.moduleTitle,
        startsAt: session.startsAt,
        timeZone: classData.timeZone,
      },
    };
    if (!submittingPermit) {
      tx.set(attendanceRef, { ...participation, checkedInAt: timestamp });
      return { id };
    }
    tx.set(permitRef, {
      ...participation,
      reason,
      status: 'pending',
      submittedAt: timestamp,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    });
    tx.update(sessionRef, {
      pendingPermitCount: session.pendingPermitCount + 1,
      lastPermitChangeId: id,
      updatedAt: timestamp,
    });
    return { id, status: 'pending' };
  });
}

export async function decidePermit(fields: Record<string, unknown>) {
  const { db, uid } = await firestoreSession();
  const id = readId(fields.permitId, 'Izin');
  const { decision } = fields;
  if (decision !== 'approved' && decision !== 'rejected') throw new Error('Keputusan tidak valid.');
  const note = typeof fields.decisionNote === 'string' ? fields.decisionNote.trim() : '';
  if (note.length > 500 || (decision === 'rejected' && !note)) {
    throw new Error('Penolakan memerlukan catatan dengan maksimal 500 karakter.');
  }

  const ref = doc(db, 'permits', id);
  return runTransaction(db, async (tx) => {
    const permit = (await tx.get(ref)).data();
    if (!permit) throw new Error('Izin tidak ditemukan.');
    if (permit.status !== 'pending') {
      if (permit.status === decision && (permit.decisionNote ?? '') === note) {
        return { id, status: decision };
      }
      throw new Error('Izin sudah diputuskan.');
    }
    const sessionRef = doc(db, 'classes', permit.classId, 'sessions', permit.sessionId);
    const session = (await tx.get(sessionRef)).data();
    if (!session || session.pendingPermitCount < 1) throw new Error('Data izin sesi tidak cocok.');

    const timestamp = serverTimestamp();
    tx.update(ref, {
      status: decision,
      decidedBy: uid,
      decidedAt: timestamp,
      decisionNote: note || null,
    });
    tx.update(sessionRef, {
      pendingPermitCount: session.pendingPermitCount - 1,
      lastPermitChangeId: id,
      updatedAt: timestamp,
    });
    return { id, status: decision };
  });
}
