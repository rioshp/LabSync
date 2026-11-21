'use strict';

const { createHash } = require('node:crypto');

const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOOKUP_WINDOW_MS = 60 * 1000;
const LOOKUP_LIMIT = 20;
const MAX_CLASSES_PER_PRACTICUM = 100;

class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

function error(code, message) {
  throw new DomainError(code, message);
}

function requiredString(value, field, min = 1, max = 512) {
  if (typeof value !== 'string') error('invalid-argument', `${field} must be a string.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max) {
    error('invalid-argument', `${field} must contain ${min}–${max} characters.`);
  }
  return clean;
}

function documentId(value, field) {
  const id = requiredString(value, field, 1, 512);
  if (id.includes('/')) error('invalid-argument', `${field} is invalid.`);
  return id;
}

function normalizeNim(value) {
  const nim = requiredString(value, 'nim', 1, 30).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{0,29}$/.test(nim)) {
    error('invalid-argument', 'NIM may contain letters, numbers, and hyphens only.');
  }
  return nim;
}

function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    error('invalid-argument', 'Request body must be an object.');
  }
  return value;
}

function assertAllowedKeys(input, allowed) {
  const accepted = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!accepted.has(key)) error('invalid-argument', `Unexpected field: ${key}.`);
  }
}

function idPair(left, right) {
  return `${left}~${right}`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function cleanPayload(input, keys) {
  const output = {};
  for (const key of keys) output[key] = input[key];
  return output;
}

function parseMillis(value, field, Timestamp) {
  let millis;
  if (typeof value === 'number') millis = value;
  else if (typeof value === 'string' && value.trim()) millis = Date.parse(value);
  else if (value && typeof value.toMillis === 'function') millis = value.toMillis();
  else if (value && typeof value.seconds === 'number') millis = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  if (!Number.isSafeInteger(Math.floor(millis)) || !Number.isFinite(millis) || millis < 0) {
    error('invalid-argument', `${field} must be a valid Unix timestamp in milliseconds.`);
  }
  return Timestamp.fromMillis(Math.floor(millis));
}

function validateTimeZone(value) {
  const timeZone = requiredString(value, 'timeZone', 1, 100);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  } catch {
    error('invalid-argument', 'timeZone must be a valid IANA time zone.');
  }
  return timeZone;
}

function validateSchedule(input, Timestamp) {
  const moduleTitle = requiredString(input.moduleTitle, 'moduleTitle', 1, 120);
  const room = requiredString(input.room, 'room', 1, 120);
  const startsAt = parseMillis(input.startsAt, 'startsAt', Timestamp);
  const endsAt = parseMillis(input.endsAt, 'endsAt', Timestamp);
  if (endsAt.toMillis() <= startsAt.toMillis()) {
    error('invalid-argument', 'endsAt must be later than startsAt.');
  }
  return { moduleTitle, room, startsAt, endsAt };
}

function snapshotFor(classData, sessionData) {
  return {
    practicumName: classData.practicumName,
    className: classData.name,
    moduleTitle: sessionData.moduleTitle,
    startsAt: sessionData.startsAt,
    timeZone: classData.timeZone,
  };
}

function createDomain({ db, FieldValue, Timestamp, getAuthUser, now = () => Date.now() }) {
  if (!db || !FieldValue || !Timestamp) throw new TypeError('db, FieldValue, and Timestamp are required.');
  const serverTimestamp = () => FieldValue.serverTimestamp();
  const users = db.collection('users');
  const practicums = db.collection('practicums');
  const classes = db.collection('classes');
  const enrollments = db.collection('enrollments');
  const attendances = db.collection('attendances');
  const permits = db.collection('permits');
  const reviews = db.collection('reviews');
  const reviewJobs = db.collection('reviewJobs');
  const reviewSummaries = db.collection('reviewSummaries');

  function activeProfile(profileSnap, uid) {
    if (!profileSnap.exists) error('failed-precondition', 'Complete account onboarding before continuing.');
    const profile = profileSnap.data();
    if (profile.accountStatus !== 'active') error('permission-denied', 'This account is disabled.');
    if (profile.role !== 'praktikan' && profile.role !== 'asisten') {
      error('failed-precondition', 'The account profile is incomplete.');
    }
    if (profile.role === 'praktikan' && (typeof profile.nim !== 'string' || !profile.nim.trim())) {
      error('failed-precondition', 'The student profile is incomplete.');
    }
    if (profile.role === 'asisten' && profile.nim != null) {
      error('failed-precondition', 'The assistant profile is invalid.');
    }
    return { ...profile, uid };
  }

  async function requireAssistant(tx, uid) {
    const snap = await tx.get(users.doc(uid));
    const profile = activeProfile(snap, uid);
    if (profile.role !== 'asisten') error('permission-denied', 'An active assistant account is required.');
    return profile;
  }

  async function requireStudent(tx, uid) {
    const snap = await tx.get(users.doc(uid));
    const profile = activeProfile(snap, uid);
    if (profile.role !== 'praktikan') error('permission-denied', 'An active student account is required.');
    return profile;
  }

  async function requireOwnedClass(tx, classId, uid, { activeOnly = true } = {}) {
    const classRef = classes.doc(classId);
    const snap = await tx.get(classRef);
    if (!snap.exists) error('not-found', 'Class not found.');
    const classData = snap.data();
    if (classData.assistantUid !== uid) error('permission-denied', 'This class belongs to another assistant.');
    if (activeOnly && classData.status !== 'active') error('failed-precondition', 'This class is archived.');
    return { ref: classRef, data: classData };
  }

  async function requireOwnedPracticum(tx, practicumId, uid, { activeOnly = true } = {}) {
    const practicumRef = practicums.doc(practicumId);
    const snap = await tx.get(practicumRef);
    if (!snap.exists) error('not-found', 'Practicum not found.');
    const data = snap.data();
    if (data.assistantUid !== uid) error('permission-denied', 'This practicum belongs to another assistant.');
    if (activeOnly && data.status !== 'active') error('failed-precondition', 'This practicum is archived.');
    return { ref: practicumRef, data };
  }

  function requestRef(uid, requestId) {
    const id = requiredString(requestId, 'requestId', 1, 128);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) error('invalid-argument', 'requestId contains invalid characters.');
    return db.collection('mutationRequests').doc(uid).collection('items').doc(id);
  }

  async function priorRequest(tx, ref, operation, payloadDigest) {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const prior = snap.data();
    if (prior.operation !== operation || prior.payloadDigest !== payloadDigest) {
      error('already-exists', 'This requestId was already used for a different operation or input.');
    }
    const expiresAt = prior.expiresAt;
    if (expiresAt && typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() <= now()) {
      error('failed-precondition', 'This requestId expired. Start a new request with a new requestId.');
    }
    const resultId = typeof prior.resultPath === 'string' ? prior.resultPath.split('/').at(-1) : null;
    if (!resultId) error('internal', 'The saved request receipt is invalid.');
    return { id: resultId };
  }

  function saveRequest(tx, ref, operation, payloadDigest, resultRef) {
    tx.create(ref, {
      operation,
      payloadDigest,
      resultPath: resultRef.path,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now() + REQUEST_TTL_MS),
    });
  }

  async function completeProfile(input, auth) {
    assertAllowedKeys(input, ['action', 'displayName', 'nim']);
    const uid = auth.uid;
    if (auth.token?.email_verified !== true) error('failed-precondition', 'Verify your email before completing onboarding.');
    const displayName = requiredString(input.displayName, 'displayName', 1, 100);
    const nim = normalizeNim(input.nim);
    const userRef = users.doc(uid);
    const keyRef = db.collection('studentKeys').doc(nim);
    return db.runTransaction(async (tx) => {
      const [userSnap, keySnap] = await Promise.all([tx.get(userRef), tx.get(keyRef)]);
      if (userSnap.exists) {
        const current = userSnap.data();
        if (current.role === 'praktikan' && current.accountStatus === 'active' && current.displayName === displayName && current.nim === nim) {
          if (keySnap.exists && keySnap.data().studentUid === uid) return { completed: true };
        }
        error('failed-precondition', 'This account already has a profile.');
      }
      if (keySnap.exists && keySnap.data().studentUid !== uid) error('already-exists', 'That NIM is already registered.');
      const timestamp = serverTimestamp();
      tx.create(userRef, {
        displayName,
        role: 'praktikan',
        accountStatus: 'active',
        nim,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      tx.create(keyRef, { studentUid: uid, createdAt: timestamp });
      return { completed: true };
    });
  }

  async function createPracticum(input, uid) {
    assertAllowedKeys(input, ['action', 'name', 'requestId']);
    const name = requiredString(input.name, 'name', 1, 100);
    const payloadDigest = digest({ name });
    const receipt = requestRef(uid, input.requestId);
    const ref = practicums.doc();
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const prior = await priorRequest(tx, receipt, 'createPracticum', payloadDigest);
      if (prior) return prior;
      const timestamp = serverTimestamp();
      tx.create(ref, {
        assistantUid: uid,
        name,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        activeClassCount: 0,
        totalClassCount: 0,
      });
      saveRequest(tx, receipt, 'createPracticum', payloadDigest, ref);
      return { id: ref.id };
    });
  }

  async function updatePracticum(input, uid) {
    assertAllowedKeys(input, ['action', 'practicumId', 'name']);
    const practicumId = documentId(input.practicumId, 'practicumId');
    const name = requiredString(input.name, 'name', 1, 100);
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const { ref, data } = await requireOwnedPracticum(tx, practicumId, uid);
      const classesQuery = classes.where('practicumId', '==', practicumId).limit(MAX_CLASSES_PER_PRACTICUM + 1);
      const classesSnap = await tx.get(classesQuery);
      if (classesSnap.size > MAX_CLASSES_PER_PRACTICUM) error('failed-precondition', 'This practicum exceeds its class limit.');
      tx.update(ref, { name, updatedAt: serverTimestamp() });
      for (const classSnap of classesSnap.docs) tx.update(classSnap.ref, { practicumName: name, updatedAt: serverTimestamp() });
      return { updated: data.name !== name };
    });
  }

  async function archivePracticum(input, uid) {
    assertAllowedKeys(input, ['action', 'practicumId']);
    const practicumId = documentId(input.practicumId, 'practicumId');
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const { ref, data } = await requireOwnedPracticum(tx, practicumId, uid);
      if (data.activeClassCount !== 0) error('failed-precondition', 'Archive active classes before archiving this practicum.');
      tx.update(ref, { status: 'archived', archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return { archived: true };
    });
  }

  async function createClass(input, uid) {
    assertAllowedKeys(input, ['action', 'practicumId', 'name', 'timeZone', 'requestId']);
    const practicumId = documentId(input.practicumId, 'practicumId');
    const name = requiredString(input.name, 'name', 1, 100);
    const timeZone = validateTimeZone(input.timeZone);
    const payloadDigest = digest({ practicumId, name, timeZone });
    const receipt = requestRef(uid, input.requestId);
    const ref = classes.doc();
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const prior = await priorRequest(tx, receipt, 'createClass', payloadDigest);
      if (prior) return prior;
      const { ref: practicumRef, data } = await requireOwnedPracticum(tx, practicumId, uid);
      if (data.totalClassCount >= MAX_CLASSES_PER_PRACTICUM) error('failed-precondition', 'This practicum has reached the 100-class limit.');
      tx.create(ref, {
        practicumId,
        practicumName: data.name,
        assistantUid: uid,
        name,
        timeZone,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        archivedAt: null,
        unfinishedSessionCount: 0,
      });
      tx.update(practicumRef, {
        activeClassCount: (data.activeClassCount || 0) + 1,
        totalClassCount: (data.totalClassCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
      saveRequest(tx, receipt, 'createClass', payloadDigest, ref);
      return { id: ref.id };
    });
  }

  async function updateClass(input, uid) {
    assertAllowedKeys(input, ['action', 'classId', 'name', 'timeZone']);
    const classId = documentId(input.classId, 'classId');
    const name = requiredString(input.name, 'name', 1, 100);
    const timeZone = validateTimeZone(input.timeZone);
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const { ref, data } = await requireOwnedClass(tx, classId, uid);
      const practicumSnap = await tx.get(practicums.doc(data.practicumId));
      if (!practicumSnap.exists || practicumSnap.data().status !== 'active') error('failed-precondition', 'This class practicum is not active.');
      tx.update(ref, { name, timeZone, updatedAt: serverTimestamp() });
      return { updated: true };
    });
  }

  async function archiveClass(input, uid) {
    assertAllowedKeys(input, ['action', 'classId']);
    const classId = documentId(input.classId, 'classId');
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const { ref, data } = await requireOwnedClass(tx, classId, uid);
      if ((data.unfinishedSessionCount || 0) > 0) error('failed-precondition', 'Finish or cancel unfinished sessions before archiving this class.');
      const practicumRef = practicums.doc(data.practicumId);
      const practicumSnap = await tx.get(practicumRef);
      if (!practicumSnap.exists || practicumSnap.data().assistantUid !== uid) error('failed-precondition', 'Parent practicum is unavailable.');
      const practicum = practicumSnap.data();
      if (practicum.status !== 'active') error('failed-precondition', 'Parent practicum is archived.');
      if ((practicum.activeClassCount || 0) < 1) error('internal', 'The active class counter is inconsistent.');
      tx.update(ref, { status: 'archived', archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      tx.update(practicumRef, { activeClassCount: practicum.activeClassCount - 1, updatedAt: serverTimestamp() });
      return { archived: true };
    });
  }

  async function lookupStudent(input, uid) {
    assertAllowedKeys(input, ['action', 'classId', 'nim']);
    const classId = documentId(input.classId, 'classId');
    const nim = normalizeNim(input.nim);
    const limitRef = db.collection('lookupLimits').doc(uid);
    const keyRef = db.collection('studentKeys').doc(nim);
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const { data: classData } = await requireOwnedClass(tx, classId, uid);
      const practicumSnap = await tx.get(practicums.doc(classData.practicumId));
      if (!practicumSnap.exists || practicumSnap.data().status !== 'active') error('failed-precondition', 'This class practicum is not active.');
      const [limitSnap, keySnap] = await Promise.all([tx.get(limitRef), tx.get(keyRef)]);
      let studentSnap = null;
      let studentUid = null;
      if (keySnap.exists) {
        studentUid = keySnap.data().studentUid;
        studentSnap = await tx.get(users.doc(studentUid));
      }
      const currentTime = now();
      const priorLimit = limitSnap.exists ? limitSnap.data() : null;
      const inWindow = priorLimit && currentTime - priorLimit.windowStartedAt <= LOOKUP_WINDOW_MS && currentTime >= priorLimit.windowStartedAt;
      if (inWindow && priorLimit.count >= LOOKUP_LIMIT) error('resource-exhausted', 'Student lookup limit reached. Try again in one minute.');
      tx.set(limitRef, {
        windowStartedAt: inWindow ? priorLimit.windowStartedAt : currentTime,
        count: inWindow ? priorLimit.count + 1 : 1,
        updatedAt: serverTimestamp(),
      });
      if (!keySnap.exists) return { studentUid: null, displayName: null, nim: null };
      if (!studentSnap?.exists) return { studentUid: null, displayName: null, nim: null };
      const student = studentSnap.data();
      if (student.role !== 'praktikan' || student.accountStatus !== 'active' || normalizeNim(student.nim) !== nim) {
        return { studentUid: null, displayName: null, nim: null };
      }
      return { studentUid, displayName: student.displayName, nim: student.nim };
    });
  }

  async function addStudent(input, uid) {
    assertAllowedKeys(input, ['action', 'classId', 'nim']);
    const classId = documentId(input.classId, 'classId');
    const nim = normalizeNim(input.nim);
    const keyRef = db.collection('studentKeys').doc(nim);
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const { data: classData } = await requireOwnedClass(tx, classId, uid);
      const practicumSnap = await tx.get(practicums.doc(classData.practicumId));
      if (!practicumSnap.exists || practicumSnap.data().status !== 'active') error('failed-precondition', 'This class practicum is not active.');
      const keySnap = await tx.get(keyRef);
      if (!keySnap.exists) error('not-found', 'No active student account matches that NIM.');
      const studentUid = keySnap.data().studentUid;
      const userRef = users.doc(studentUid);
      const studentSnap = await tx.get(userRef);
      if (!studentSnap.exists) error('not-found', 'No active student account matches that NIM.');
      const student = studentSnap.data();
      if (student.role !== 'praktikan' || student.accountStatus !== 'active' || normalizeNim(student.nim) !== nim) {
        error('not-found', 'No active student account matches that NIM.');
      }
      const actualEnrollmentRef = enrollments.doc(idPair(classId, studentUid));
      const enrollmentSnap = await tx.get(actualEnrollmentRef);
      if (enrollmentSnap.exists && enrollmentSnap.data().status === 'active') return { studentUid, added: false };
      const timestamp = serverTimestamp();
      tx.set(actualEnrollmentRef, {
        classId,
        assistantUid: uid,
        studentUid,
        studentNameSnapshot: student.displayName,
        nimSnapshot: student.nim,
        status: 'active',
        joinedAt: timestamp,
        updatedAt: timestamp,
        removedAt: null,
      });
      return { studentUid, added: true };
    });
  }

  async function removeStudent(input, uid) {
    assertAllowedKeys(input, ['action', 'classId', 'studentUid']);
    const classId = documentId(input.classId, 'classId');
    const studentUid = documentId(input.studentUid, 'studentUid');
    const ref = enrollments.doc(idPair(classId, studentUid));
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      await requireOwnedClass(tx, classId, uid, { activeOnly: false });
      const snap = await tx.get(ref);
      if (!snap.exists) error('not-found', 'Class membership not found.');
      const current = snap.data();
      if (current.status === 'removed') return { removed: false };
      tx.update(ref, { status: 'removed', removedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return { removed: true };
    });
  }

  async function createSession(input, uid) {
    assertAllowedKeys(input, ['action', 'classId', 'moduleTitle', 'room', 'startsAt', 'endsAt', 'requestId']);
    const classId = documentId(input.classId, 'classId');
    const schedule = validateSchedule(input, Timestamp);
    const payloadDigest = digest({ classId, moduleTitle: schedule.moduleTitle, room: schedule.room, startsAt: schedule.startsAt.toMillis(), endsAt: schedule.endsAt.toMillis() });
    const receipt = requestRef(uid, input.requestId);
    const ref = classes.doc(classId).collection('sessions').doc();
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const prior = await priorRequest(tx, receipt, 'createSession', payloadDigest);
      if (prior) return prior;
      const { data: classData } = await requireOwnedClass(tx, classId, uid);
      const practicumSnap = await tx.get(practicums.doc(classData.practicumId));
      if (!practicumSnap.exists || practicumSnap.data().status !== 'active') error('failed-precondition', 'This class practicum is not active.');
      tx.create(ref, {
        assistantUid: uid,
        moduleTitle: schedule.moduleTitle,
        room: schedule.room,
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
        status: 'scheduled',
        openedAt: null,
        closedAt: null,
        cancelledAt: null,
        pendingPermitCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const classRef = classes.doc(classId);
      tx.update(classRef, { unfinishedSessionCount: (classData.unfinishedSessionCount || 0) + 1, updatedAt: serverTimestamp() });
      saveRequest(tx, receipt, 'createSession', payloadDigest, ref);
      return { id: ref.id };
    });
  }

  async function updateSession(input, uid) {
    assertAllowedKeys(input, ['action', 'classId', 'sessionId', 'moduleTitle', 'room', 'startsAt', 'endsAt']);
    const classId = documentId(input.classId, 'classId');
    const sessionId = documentId(input.sessionId, 'sessionId');
    const schedule = validateSchedule(input, Timestamp);
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const { ref: classRef } = await requireOwnedClass(tx, classId, uid);
      const sessionRef = classRef.collection('sessions').doc(sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) error('not-found', 'Session not found.');
      const session = sessionSnap.data();
      if (session.assistantUid !== uid) error('permission-denied', 'This session belongs to another assistant.');
      if (session.status !== 'scheduled') error('failed-precondition', 'Only scheduled sessions can be edited.');
      tx.update(sessionRef, { ...schedule, updatedAt: serverTimestamp() });
      return { updated: true };
    });
  }

  async function setSessionState(input, uid, action) {
    assertAllowedKeys(input, ['action', 'classId', 'sessionId']);
    const classId = documentId(input.classId, 'classId');
    const sessionId = documentId(input.sessionId, 'sessionId');
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const { ref: classRef, data: classData } = await requireOwnedClass(tx, classId, uid);
      const sessionRef = classRef.collection('sessions').doc(sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) error('not-found', 'Session not found.');
      const session = sessionSnap.data();
      if (session.assistantUid !== uid) error('permission-denied', 'This session belongs to another assistant.');

      if (action === 'openSession') {
        if (session.status === 'open') return { status: 'open' };
        if (session.status !== 'scheduled') error('failed-precondition', 'This session cannot be opened again.');
        tx.update(sessionRef, { status: 'open', openedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return { status: 'open' };
      }

      if (action === 'closeSession') {
        if (session.status === 'closed') return { status: 'closed' };
        if (session.status !== 'open') error('failed-precondition', 'Only an open session can be closed.');
        if ((classData.unfinishedSessionCount || 0) < 1) error('internal', 'The unfinished session counter is inconsistent.');
        tx.update(sessionRef, { status: 'closed', closedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        tx.update(classRef, { unfinishedSessionCount: classData.unfinishedSessionCount - 1, updatedAt: serverTimestamp() });
        return { status: 'closed' };
      }

      if (action === 'cancelSession') {
        if (session.status === 'cancelled') return { status: 'cancelled' };
        if (session.status !== 'scheduled') error('failed-precondition', 'Only a scheduled session can be cancelled.');
        if ((session.pendingPermitCount || 0) > 0) error('failed-precondition', 'Resolve pending permits before cancelling this session.');
        if ((classData.unfinishedSessionCount || 0) < 1) error('internal', 'The unfinished session counter is inconsistent.');
        tx.update(sessionRef, { status: 'cancelled', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() });
        tx.update(classRef, { unfinishedSessionCount: classData.unfinishedSessionCount - 1, updatedAt: serverTimestamp() });
        return { status: 'cancelled' };
      }
      error('invalid-argument', 'Unsupported session action.');
    });
  }

  async function checkIn(input, uid) {
    assertAllowedKeys(input, ['action', 'classId', 'sessionId']);
    const classId = documentId(input.classId, 'classId');
    const sessionId = documentId(input.sessionId, 'sessionId');
    const classRef = classes.doc(classId);
    const sessionRef = classRef.collection('sessions').doc(sessionId);
    const attendanceRef = attendances.doc(idPair(sessionId, uid));
    const permitRef = permits.doc(idPair(sessionId, uid));
    const enrollmentRef = enrollments.doc(idPair(classId, uid));
    const userRef = users.doc(uid);
    let checkedInAtMillis = null;
    await db.runTransaction(async (tx) => {
      const [profileSnap, attendanceSnap, permitSnap, classSnap, sessionSnap, enrollmentSnap] = await Promise.all([
        tx.get(userRef), tx.get(attendanceRef), tx.get(permitRef), tx.get(classRef), tx.get(sessionRef), tx.get(enrollmentRef),
      ]);
      const student = activeProfile(profileSnap, uid);
      if (student.role !== 'praktikan') error('permission-denied', 'An active student account is required.');
      if (attendanceSnap.exists) {
        const existing = attendanceSnap.data();
        checkedInAtMillis = existing.checkedInAt?.toMillis?.() ?? null;
        return;
      }
      if (!classSnap.exists || !sessionSnap.exists) error('not-found', 'Session not found.');
      const classData = classSnap.data();
      const session = sessionSnap.data();
      if (classData.status !== 'active') error('failed-precondition', 'This class is archived.');
      if (session.assistantUid !== classData.assistantUid) error('failed-precondition', 'Session ownership is invalid.');
      if (session.status !== 'open') error('failed-precondition', 'Attendance is available only while the session is open.');
      if (!enrollmentSnap.exists || enrollmentSnap.data().status !== 'active' || enrollmentSnap.data().studentUid !== uid) {
        error('permission-denied', 'You are not an active member of this class.');
      }
      if (permitSnap.exists && ['pending', 'approved'].includes(permitSnap.data().status)) {
        error('failed-precondition', 'A pending or approved permit prevents attendance for this session.');
      }
      const checkedInAt = serverTimestamp();
      const snapshot = snapshotFor(classData, session);
      tx.create(attendanceRef, {
        classId,
        sessionId,
        assistantUid: classData.assistantUid,
        studentUid: uid,
        studentNameSnapshot: student.displayName,
        nimSnapshot: student.nim,
        sessionSnapshot: snapshot,
        checkedInAt,
      });
      checkedInAtMillis = now();
    });
    return { id: attendanceRef.id, checkedInAt: checkedInAtMillis };
  }

  async function submitPermit(input, uid) {
    assertAllowedKeys(input, ['action', 'classId', 'sessionId', 'reason']);
    const classId = documentId(input.classId, 'classId');
    const sessionId = documentId(input.sessionId, 'sessionId');
    const reason = requiredString(input.reason, 'reason', 10, 1000);
    const classRef = classes.doc(classId);
    const sessionRef = classRef.collection('sessions').doc(sessionId);
    const enrollmentRef = enrollments.doc(idPair(classId, uid));
    const attendanceRef = attendances.doc(idPair(sessionId, uid));
    const permitRef = permits.doc(idPair(sessionId, uid));
    return db.runTransaction(async (tx) => {
      const [profileSnap, classSnap, sessionSnap, enrollmentSnap, attendanceSnap, permitSnap] = await Promise.all([
        tx.get(users.doc(uid)), tx.get(classRef), tx.get(sessionRef), tx.get(enrollmentRef), tx.get(attendanceRef), tx.get(permitRef),
      ]);
      const student = activeProfile(profileSnap, uid);
      if (student.role !== 'praktikan') error('permission-denied', 'An active student account is required.');
      if (!classSnap.exists || !sessionSnap.exists) error('not-found', 'Session not found.');
      const classData = classSnap.data();
      const session = sessionSnap.data();
      if (classData.status !== 'active') error('failed-precondition', 'This class is archived.');
      if (session.status !== 'scheduled' && session.status !== 'open') error('failed-precondition', 'Permits can only be submitted before a session is finished.');
      if (!enrollmentSnap.exists || enrollmentSnap.data().status !== 'active' || enrollmentSnap.data().studentUid !== uid) {
        error('permission-denied', 'You are not an active member of this class.');
      }
      if (attendanceSnap.exists) error('failed-precondition', 'You already attended this session.');
      if (permitSnap.exists) error('already-exists', 'A permit was already submitted for this session.');
      const sessionData = sessionSnap.data();
      if ((sessionData.pendingPermitCount || 0) < 0) error('internal', 'The pending permit counter is invalid.');
      const timestamp = serverTimestamp();
      tx.create(permitRef, {
        classId,
        sessionId,
        assistantUid: classData.assistantUid,
        studentUid: uid,
        studentNameSnapshot: student.displayName,
        nimSnapshot: student.nim,
        sessionSnapshot: snapshotFor(classData, sessionData),
        reason,
        status: 'pending',
        submittedAt: timestamp,
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      });
      tx.update(sessionRef, { pendingPermitCount: (sessionData.pendingPermitCount || 0) + 1, updatedAt: serverTimestamp() });
      return { id: permitRef.id, status: 'pending' };
    });
  }

  async function decidePermit(input, uid) {
    assertAllowedKeys(input, ['action', 'permitId', 'decision', 'decisionNote']);
    const permitId = documentId(input.permitId, 'permitId');
    if (input.decision !== 'approved' && input.decision !== 'rejected') error('invalid-argument', 'decision must be approved or rejected.');
    const note = input.decisionNote == null ? '' : requiredString(input.decisionNote, 'decisionNote', 1, 500);
    if (input.decision === 'rejected' && !note) error('invalid-argument', 'A rejection note is required.');
    const permitRef = permits.doc(permitId);
    return db.runTransaction(async (tx) => {
      await requireAssistant(tx, uid);
      const permitSnap = await tx.get(permitRef);
      if (!permitSnap.exists) error('not-found', 'Permit not found.');
      const permit = permitSnap.data();
      const sessionRef = classes.doc(permit.classId).collection('sessions').doc(permit.sessionId);
      const [sessionSnap, classSnap] = await Promise.all([tx.get(sessionRef), tx.get(classes.doc(permit.classId))]);
      if (!classSnap.exists || !sessionSnap.exists) error('not-found', 'The permit session no longer exists.');
      const session = sessionSnap.data();
      const classData = classSnap.data();
      if (permit.assistantUid !== uid || session.assistantUid !== uid || classData.assistantUid !== uid) {
        error('permission-denied', 'This permit belongs to another assistant.');
      }
      if (permit.status !== 'pending') {
        if (permit.status === input.decision && (permit.decisionNote || '') === note) return { id: permitId, status: permit.status };
        error('failed-precondition', 'This permit has already been decided.');
      }
      if ((session.pendingPermitCount || 0) < 1) error('internal', 'The pending permit counter is inconsistent.');
      tx.update(permitRef, {
        status: input.decision,
        decidedBy: uid,
        decidedAt: serverTimestamp(),
        decisionNote: note || null,
      });
      tx.update(sessionRef, { pendingPermitCount: session.pendingPermitCount - 1, updatedAt: serverTimestamp() });
      return { id: permitId, status: input.decision };
    });
  }

  async function submitReview(input, uid) {
    assertAllowedKeys(input, ['action', 'classId', 'sessionId', 'text']);
    const classId = documentId(input.classId, 'classId');
    const sessionId = documentId(input.sessionId, 'sessionId');
    const text = requiredString(input.text, 'text', 10, 1000);
    const reviewId = idPair(sessionId, uid);
    const reviewRef = reviews.doc(reviewId);
    const jobRef = reviewJobs.doc(reviewId);
    const summaryRef = reviewSummaries.doc(sessionId);
    const classRef = classes.doc(classId);
    const sessionRef = classRef.collection('sessions').doc(sessionId);
    const attendanceRef = attendances.doc(reviewId);
    return db.runTransaction(async (tx) => {
      const [profileSnap, classSnap, sessionSnap, attendanceSnap, reviewSnap, summarySnap] = await Promise.all([
        tx.get(users.doc(uid)), tx.get(classRef), tx.get(sessionRef), tx.get(attendanceRef), tx.get(reviewRef), tx.get(summaryRef),
      ]);
      const student = activeProfile(profileSnap, uid);
      if (student.role !== 'praktikan') error('permission-denied', 'An active student account is required.');
      if (reviewSnap.exists) return { id: reviewId, analysisStatus: reviewSnap.data().analysisStatus };
      if (!classSnap.exists || !sessionSnap.exists) error('not-found', 'Session not found.');
      const classData = classSnap.data();
      const session = sessionSnap.data();
      if (session.assistantUid !== classData.assistantUid) error('failed-precondition', 'Session ownership is invalid.');
      if (session.status !== 'closed') error('failed-precondition', 'Reviews can only be submitted after a session is finished.');
      if (!attendanceSnap.exists || attendanceSnap.data().studentUid !== uid) error('permission-denied', 'Only students who attended this session can review it.');
      const priorSummary = summarySnap.exists ? summarySnap.data() : null;
      const timestamp = serverTimestamp();
      tx.create(reviewRef, {
        classId,
        sessionId,
        assistantUid: classData.assistantUid,
        studentUid: uid,
        text,
        submittedAt: timestamp,
        analysisStatus: 'pending',
        sentiment: null,
        modelVersion: null,
        analyzedAt: null,
      });
      tx.create(jobRef, {
        state: 'pending',
        attemptCount: 0,
        leaseUntil: null,
        attemptId: null,
        nextAttemptAt: timestamp,
        lastErrorCode: null,
        updatedAt: timestamp,
      });
      const summary = {
        classId,
        assistantUid: classData.assistantUid,
        totalSubmitted: (priorSummary?.totalSubmitted || 0) + 1,
        positiveCount: priorSummary?.positiveCount || 0,
        neutralCount: priorSummary?.neutralCount || 0,
        negativeCount: priorSummary?.negativeCount || 0,
        failedCount: priorSummary?.failedCount || 0,
        updatedAt: timestamp,
      };
      if (summarySnap.exists) tx.set(summaryRef, summary);
      else tx.create(summaryRef, summary);
      return { id: reviewId, analysisStatus: 'pending' };
    });
  }

  async function operator(input, uid, token) {
    if (token?.labsyncOperator !== true) error('permission-denied', 'Operator privileges are required.');
    if (input.action === 'provisionAssistant') {
      assertAllowedKeys(input, ['action', 'uid', 'displayName']);
      const targetUid = documentId(input.uid, 'uid');
      const target = await getAuthUser?.(targetUid);
      if (!target) error('not-found', 'Akun Firebase Authentication tidak ditemukan.');
      if (!target.emailVerified || target.disabled) {
        error('failed-precondition', 'Akun asisten harus aktif dan emailnya sudah terverifikasi.');
      }
      const userRef = users.doc(targetUid);
      const keyCollection = db.collection('studentKeys');
      const queries = [
        enrollments.where('studentUid', '==', targetUid).limit(1),
        attendances.where('studentUid', '==', targetUid).limit(1),
        permits.where('studentUid', '==', targetUid).limit(1),
        reviews.where('studentUid', '==', targetUid).limit(1),
      ];
      return db.runTransaction(async (tx) => {
        const [userSnap, enrollmentSnap, attendanceSnap, permitSnap, reviewSnap] = await Promise.all([
          tx.get(userRef), ...queries.map((query) => tx.get(query)),
        ]);
        if (!userSnap.exists) {
          if ([enrollmentSnap, attendanceSnap, permitSnap, reviewSnap].some((snap) => !snap.empty)) {
            error('failed-precondition', 'Identitas sudah memiliki catatan akademik. Hubungi pengelola.');
          }
          const displayName = requiredString(input.displayName ?? target.displayName, 'displayName', 1, 100);
          tx.create(userRef, {
            displayName, role: 'asisten', accountStatus: 'active', nim: null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
          return { provisioned: true };
        }
        const profile = userSnap.data();
        if (profile.role === 'asisten' && profile.accountStatus === 'active' && profile.nim == null) return { provisioned: false };
        if (profile.role !== 'praktikan' || profile.accountStatus !== 'active') error('failed-precondition', 'Only an active student account can be provisioned as an assistant.');
        if ([enrollmentSnap, attendanceSnap, permitSnap, reviewSnap].some((snap) => !snap.empty)) {
          error('failed-precondition', 'This account has academic records. Provision a separate assistant account.');
        }
        const nim = normalizeNim(profile.nim);
        const keyRef = keyCollection.doc(nim);
        const keySnap = await tx.get(keyRef);
        if (keySnap.exists && keySnap.data().studentUid !== targetUid) error('failed-precondition', 'The student NIM claim is inconsistent.');
        tx.update(userRef, { role: 'asisten', nim: null, updatedAt: serverTimestamp() });
        if (keySnap.exists) tx.delete(keyRef);
        return { provisioned: true };
      });
    }

    if (input.action === 'setAccountStatus') {
      assertAllowedKeys(input, ['action', 'uid', 'accountStatus']);
      const targetUid = documentId(input.uid, 'uid');
      if (input.accountStatus !== 'active' && input.accountStatus !== 'disabled') error('invalid-argument', 'accountStatus must be active or disabled.');
      return db.runTransaction(async (tx) => {
        const ref = users.doc(targetUid);
        const snap = await tx.get(ref);
        if (!snap.exists) error('not-found', 'User profile not found.');
        const profile = snap.data();
        if (profile.accountStatus === input.accountStatus) return { accountStatus: input.accountStatus };
        tx.update(ref, { accountStatus: input.accountStatus, updatedAt: serverTimestamp() });
        return { accountStatus: input.accountStatus };
      });
    }

    if (input.action === 'retryReview') {
      assertAllowedKeys(input, ['action', 'sessionId', 'studentUid']);
      const sessionId = documentId(input.sessionId, 'sessionId');
      const studentUid = documentId(input.studentUid, 'studentUid');
      const reviewId = idPair(sessionId, studentUid);
      const reviewRef = reviews.doc(reviewId);
      const jobRef = reviewJobs.doc(reviewId);
      return db.runTransaction(async (tx) => {
        const [reviewSnap, jobSnap] = await Promise.all([tx.get(reviewRef), tx.get(jobRef)]);
        if (!reviewSnap.exists || !jobSnap.exists) error('not-found', 'Review job not found.');
        const review = reviewSnap.data();
        if (review.sessionId !== sessionId || review.studentUid !== studentUid) error('failed-precondition', 'Review identity is invalid.');
        const summaryRef = reviewSummaries.doc(sessionId);
        const summarySnap = await tx.get(summaryRef);
        const job = jobSnap.data();
        if (job.state === 'pending') return { queued: false };
        if (job.state !== 'failed') error('failed-precondition', 'Only failed review jobs can be retried.');
        if (!summarySnap.exists || (summarySnap.data().failedCount || 0) < 1) error('internal', 'Review summary failed count is inconsistent.');
        const timestamp = serverTimestamp();
        tx.update(jobRef, {
          state: 'pending',
          attemptCount: 0,
          leaseUntil: null,
          attemptId: null,
          nextAttemptAt: timestamp,
          lastErrorCode: null,
          updatedAt: timestamp,
        });
        tx.update(reviewRef, {
          analysisStatus: 'pending',
          sentiment: null,
          modelVersion: null,
          analyzedAt: null,
        });
        tx.update(summaryRef, { failedCount: summarySnap.data().failedCount - 1, updatedAt: timestamp });
        return { queued: true };
      });
    }
    error('invalid-argument', 'Unsupported operator action.');
  }

  async function mutate(data, request) {
    const input = assertObject(data);
    const action = requiredString(input.action, 'action', 1, 80);
    const auth = request?.auth;
    if (!auth?.uid) error('unauthenticated', 'Sign in before continuing.');
    const uid = auth.uid;
    switch (action) {
      case 'completeProfile': return completeProfile(input, auth);
      case 'createPracticum': return createPracticum(input, uid);
      case 'updatePracticum': return updatePracticum(input, uid);
      case 'archivePracticum': return archivePracticum(input, uid);
      case 'createClass': return createClass(input, uid);
      case 'updateClass': return updateClass(input, uid);
      case 'archiveClass': return archiveClass(input, uid);
      case 'lookupStudent': return lookupStudent(input, uid);
      case 'addStudent': return addStudent(input, uid);
      case 'removeStudent': return removeStudent(input, uid);
      case 'createSession': return createSession(input, uid);
      case 'updateSession': return updateSession(input, uid);
      case 'openSession':
      case 'closeSession':
      case 'cancelSession': return setSessionState(input, uid, action);
      case 'checkIn': return checkIn(input, uid);
      case 'submitPermit': return submitPermit(input, uid);
      case 'decidePermit': return decidePermit(input, uid);
      case 'submitReview': return submitReview(input, uid);
      case 'provisionAssistant':
      case 'setAccountStatus':
      case 'retryReview': return operator(input, uid, auth.token);
      default: error('invalid-argument', 'Unsupported action.');
    }
  }

  return { mutate };
}

module.exports = { DomainError, createDomain };
