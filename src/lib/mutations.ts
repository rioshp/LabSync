import { randomUUID } from 'expo-crypto';

import { changeClass } from './classes';
import { firebaseErrorCode } from './firebase-error';
import {
  notifyPermitDecided,
  notifySessionOpened,
  notifySessionUpdated,
} from './notification-triggers';
import { decidePermit, recordParticipation } from './participation';
import { getReviewAccess, submitReview } from './reviews';
import { changeEnrollment, lookupStudent, lookupStudentsByName } from './roster';
import { changeSession } from './sessions';

type Fields = Record<string, unknown>;

const actions = {
  createClass: (fields: Fields) => changeClass('createClass', fields),
  updateClass: (fields: Fields) => changeClass('updateClass', fields),
  archiveClass: (fields: Fields) => changeClass('archiveClass', fields),
  createSession: (fields: Fields) => changeSession('createSession', fields),
  updateSession: (fields: Fields) => changeSession('updateSession', fields),
  openSession: (fields: Fields) => changeSession('openSession', fields),
  closeSession: (fields: Fields) => changeSession('closeSession', fields),
  cancelSession: (fields: Fields) => changeSession('cancelSession', fields),
  lookupStudent,
  lookupStudentsByName,
  addStudent: (fields: Fields) => changeEnrollment('addStudent', fields),
  removeStudent: (fields: Fields) => changeEnrollment('removeStudent', fields),
  checkIn: (fields: Fields) => recordParticipation('checkIn', fields),
  submitPermit: (fields: Fields) => recordParticipation('submitPermit', fields),
  decidePermit,
  getReviewAccess,
  submitReview,
};

export function newRequestId() {
  return randomUUID();
}

export async function mutate<T = unknown>(
  action: keyof typeof actions,
  fields: Fields,
): Promise<T> {
  const result = (await actions[action](fields)) as T;

  // Jalankan trigger push notification setelah mutasi berhasil (non-blocking).
  try {
    if (
      action === 'openSession' &&
      typeof fields.classId === 'string' &&
      typeof fields.sessionId === 'string'
    ) {
      void notifySessionOpened({
        classId: fields.classId,
        sessionId: fields.sessionId,
      }).catch((err) => console.warn('Trigger notification openSession error:', err));
    } else if (
      action === 'updateSession' &&
      typeof fields.classId === 'string' &&
      typeof fields.sessionId === 'string'
    ) {
      void notifySessionUpdated({
        classId: fields.classId,
        sessionId: fields.sessionId,
        action: 'updateSession',
      }).catch((err) => console.warn('Trigger notification updateSession error:', err));
    } else if (
      action === 'cancelSession' &&
      typeof fields.classId === 'string' &&
      typeof fields.sessionId === 'string'
    ) {
      void notifySessionUpdated({
        classId: fields.classId,
        sessionId: fields.sessionId,
        action: 'cancelSession',
      }).catch((err) => console.warn('Trigger notification cancelSession error:', err));
    } else if (
      action === 'decidePermit' &&
      typeof fields.permitId === 'string' &&
      (fields.decision === 'approved' || fields.decision === 'rejected')
    ) {
      void notifyPermitDecided({
        permitId: fields.permitId,
        decision: fields.decision,
        decisionNote: typeof fields.decisionNote === 'string' ? fields.decisionNote : undefined,
      }).catch((err) => console.warn('Trigger notification decidePermit error:', err));
    }
  } catch (error) {
    console.warn('Gagal memicu trigger notifikasi:', error);
  }

  return result;
}

export function mutationError(error: unknown) {
  const code = firebaseErrorCode(error);
  if (['unavailable', 'deadline-exceeded', 'network-request-failed'].includes(code)) {
    return 'Server belum dapat dihubungi. Periksa koneksi lalu coba lagi.';
  }
  if (code === 'unauthenticated') return 'Sesi akun tidak tersedia. Silakan masuk lagi.';
  if (code === 'permission-denied') return 'Akun kamu tidak memiliki akses untuk tindakan ini.';
  if (
    [
      'already-exists',
      'invalid-argument',
      'failed-precondition',
      'not-found',
      'resource-exhausted',
    ].includes(code) &&
    error instanceof Error
  )
    return error.message;
  if (!code && error instanceof Error) return error.message;
  return 'Tindakan belum berhasil. Silakan coba lagi.';
}
