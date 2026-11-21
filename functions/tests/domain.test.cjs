'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDomain, DomainError } = require('../domain.cjs');

class FakeTimestamp {
  constructor(millis) {
    this.millis = millis;
  }
  toMillis() {
    return this.millis;
  }
  static fromMillis(millis) {
    return new FakeTimestamp(millis);
  }
}

const SERVER_TIMESTAMP = Symbol('server-timestamp');

function clone(value) {
  if (value instanceof FakeTimestamp) return new FakeTimestamp(value.toMillis());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) result[key] = clone(entry);
    return result;
  }
  return value;
}

class FakeSnapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = value !== undefined;
    this._value = value === undefined ? undefined : clone(value);
  }
  data() {
    return this._value === undefined ? undefined : clone(this._value);
  }
}

class FakeQuery {
  constructor(path, filters = [], max = Infinity) {
    this.path = path;
    this.filters = filters;
    this.max = max;
  }
  where(field, operator, value) {
    return new FakeQuery(this.path, [...this.filters, [field, operator, value]], this.max);
  }
  limit(max) {
    return new FakeQuery(this.path, this.filters, max);
  }
  _docs(store) {
    const prefix = `${this.path}/`;
    const depth = this.path.split('/').length + 1;
    const result = [];
    for (const [path, value] of store) {
      if (!path.startsWith(prefix) || path.split('/').length !== depth) continue;
      const ref = new FakeDocumentReference(path);
      if (
        !this.filters.every(([field, operator, expected]) => {
          const actual = field === '__name__' ? ref.id : value[field];
          if (operator === '==') return actual === expected;
          if (operator === '<=') return actual <= expected;
          return false;
        })
      )
        continue;
      result.push(new FakeSnapshot(ref, value));
      if (result.length >= this.max) break;
    }
    return result;
  }
}

class FakeDocumentReference {
  constructor(path) {
    this.path = path;
    this.id = path.split('/').at(-1);
  }
  collection(name) {
    return new FakeCollectionReference(`${this.path}/${name}`);
  }
}

class FakeCollectionReference extends FakeQuery {
  constructor(path, filters = [], max = Infinity) {
    super(path, filters, max);
  }
  doc(id) {
    if (!id)
      return new FakeDocumentReference(
        `${this.path}/auto_${String(++FakeFirestore.nextId).padStart(4, '0')}`,
      );
    return new FakeDocumentReference(`${this.path}/${id}`);
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.writes = [];
  }
  async get(refOrQuery) {
    if (refOrQuery instanceof FakeQuery) {
      const docs = refOrQuery._docs(this.db.store);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
    return new FakeSnapshot(refOrQuery, this.db.store.get(refOrQuery.path));
  }
  create(ref, value) {
    this.writes.push({ kind: 'create', ref, value: clone(value) });
  }
  set(ref, value, options = {}) {
    this.writes.push({ kind: 'set', ref, value: clone(value), merge: options.merge === true });
  }
  update(ref, value) {
    this.writes.push({ kind: 'update', ref, value: clone(value) });
  }
  delete(ref) {
    this.writes.push({ kind: 'delete', ref });
  }
}

class FakeFirestore {
  static nextId = 0;
  constructor(now = () => 1_800_000_000_000) {
    this.store = new Map();
    this.now = now;
  }
  collection(path) {
    return new FakeCollectionReference(path);
  }
  async runTransaction(callback) {
    const transaction = new FakeTransaction(this);
    const result = await callback(transaction);
    for (const write of transaction.writes) {
      const current = this.store.get(write.ref.path);
      if (write.kind === 'create' && current !== undefined) {
        const error = new Error('already exists');
        error.code = 'already-exists';
        throw error;
      }
      if ((write.kind === 'update' || write.kind === 'delete') && current === undefined) {
        const error = new Error('not found');
        error.code = 'not-found';
        throw error;
      }
      if (write.kind === 'delete') {
        this.store.delete(write.ref.path);
        continue;
      }
      const value = materialize(write.value, this.now);
      if (write.kind === 'update' || write.merge)
        this.store.set(write.ref.path, { ...(current || {}), ...value });
      else this.store.set(write.ref.path, value);
    }
    return result;
  }
  seed(path, value) {
    this.store.set(path, clone(value));
  }
}

function materialize(value, now) {
  if (value === SERVER_TIMESTAMP) return FakeTimestamp.fromMillis(now());
  if (value instanceof FakeTimestamp) return new FakeTimestamp(value.toMillis());
  if (Array.isArray(value)) return value.map((entry) => materialize(entry, now));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) result[key] = materialize(entry, now);
    return result;
  }
  return value;
}

function setup() {
  let clock = 1_800_000_000_000;
  const db = new FakeFirestore(() => clock);
  const FieldValue = { serverTimestamp: () => SERVER_TIMESTAMP };
  const Timestamp = FakeTimestamp;
  const domain = createDomain({ db, FieldValue, Timestamp, now: () => clock });
  const auth = (uid, verified = true, claims = {}) => ({
    uid,
    token: { email_verified: verified, ...claims },
  });
  const call = (data, caller) => domain.mutate(data, { auth: caller });
  const addAssistant = (uid) =>
    db.seed(`users/${uid}`, {
      displayName: `Assistant ${uid}`,
      role: 'asisten',
      accountStatus: 'active',
      nim: null,
    });
  return {
    db,
    domain,
    call,
    auth,
    addAssistant,
    setClock: (value) => {
      clock = value;
    },
  };
}

async function makeClassAndSession(env, assistantUid, studentUid) {
  const p = await env.call(
    { action: 'createPracticum', name: 'Biologi', requestId: 'prac-1' },
    env.auth(assistantUid),
  );
  const c = await env.call(
    {
      action: 'createClass',
      practicumId: p.id,
      name: 'A',
      timeZone: 'Asia/Jakarta',
      requestId: 'class-1',
    },
    env.auth(assistantUid),
  );
  await env.call({ action: 'addStudent', classId: c.id, nim: '2026001' }, env.auth(assistantUid));
  const s = await env.call(
    {
      action: 'createSession',
      classId: c.id,
      moduleTitle: 'Mikroskop',
      room: 'Lab 2',
      startsAt: 1_800_000_100_000,
      endsAt: 1_800_000_200_000,
      requestId: 'session-1',
    },
    env.auth(assistantUid),
  );
  return { ...p, classId: c.id, sessionId: s.id };
}

test('onboarding claims a unique normalized NIM and only creates student profiles', async () => {
  const env = setup();
  await env.call(
    { action: 'completeProfile', displayName: 'Dewi Putri', nim: ' 2026-001 ' },
    env.auth('student-a'),
  );
  const profile = env.db.store.get('users/student-a');
  assert.equal(profile.displayName, 'Dewi Putri');
  assert.equal(profile.role, 'praktikan');
  assert.equal(profile.accountStatus, 'active');
  assert.equal(profile.nim, '2026-001');
  assert.equal(env.db.store.get('studentKeys/2026-001').studentUid, 'student-a');
  await assert.rejects(
    env.call(
      { action: 'completeProfile', displayName: 'Another Student', nim: '2026-001' },
      env.auth('student-b'),
    ),
    (err) => err instanceof DomainError && err.code === 'already-exists',
  );
  await assert.rejects(
    env.call(
      { action: 'completeProfile', displayName: 'Unverified', nim: '22' },
      env.auth('unverified', false),
    ),
    (err) => err instanceof DomainError && err.code === 'failed-precondition',
  );
});

test('auto-ID creates are idempotent and reject requestId payload changes', async () => {
  const env = setup();
  env.addAssistant('assistant-a');
  const first = await env.call(
    { action: 'createPracticum', name: 'Fisika', requestId: 'same-key' },
    env.auth('assistant-a'),
  );
  const retry = await env.call(
    { action: 'createPracticum', name: 'Fisika', requestId: 'same-key' },
    env.auth('assistant-a'),
  );
  assert.deepEqual(retry, first);
  assert.equal([...env.db.store.keys()].filter((key) => key.startsWith('practicums/')).length, 1);
  await assert.rejects(
    env.call(
      { action: 'createPracticum', name: 'Kimia', requestId: 'same-key' },
      env.auth('assistant-a'),
    ),
    (err) => err instanceof DomainError && err.code === 'already-exists',
  );
});

test('assistant ownership, session counters, and terminal status transitions are enforced', async () => {
  const env = setup();
  env.addAssistant('assistant-a');
  env.addAssistant('assistant-b');
  await env.call(
    { action: 'completeProfile', displayName: 'Dewi Putri', nim: '2026001' },
    env.auth('student-a'),
  );
  const { classId, sessionId } = await makeClassAndSession(env, 'assistant-a', 'student-a');
  const classPath = `classes/${classId}`;
  assert.equal(env.db.store.get(classPath).unfinishedSessionCount, 1);
  await assert.rejects(
    env.call({ action: 'openSession', classId, sessionId }, env.auth('assistant-b')),
    (err) => err instanceof DomainError && err.code === 'permission-denied',
  );
  await env.call({ action: 'openSession', classId, sessionId }, env.auth('assistant-a'));
  await env.call({ action: 'closeSession', classId, sessionId }, env.auth('assistant-a'));
  await env.call({ action: 'closeSession', classId, sessionId }, env.auth('assistant-a'));
  assert.equal(env.db.store.get(classPath).unfinishedSessionCount, 0);
  await assert.rejects(
    env.call({ action: 'openSession', classId, sessionId }, env.auth('assistant-a')),
    (err) => err instanceof DomainError && err.code === 'failed-precondition',
  );
});

test('permit blocks attendance; after rejection attendance is recorded once and review queues atomically', async () => {
  const env = setup();
  env.addAssistant('assistant-a');
  await env.call(
    { action: 'completeProfile', displayName: 'Dewi Putri', nim: '2026001' },
    env.auth('student-a'),
  );
  const { classId, sessionId } = await makeClassAndSession(env, 'assistant-a', 'student-a');
  await env.call({ action: 'openSession', classId, sessionId }, env.auth('assistant-a'));
  const permit = await env.call(
    { action: 'submitPermit', classId, sessionId, reason: 'Demam dan perlu istirahat.' },
    env.auth('student-a'),
  );
  await assert.rejects(
    env.call({ action: 'checkIn', classId, sessionId }, env.auth('student-a')),
    (err) => err instanceof DomainError && err.code === 'failed-precondition',
  );
  await env.call(
    {
      action: 'decidePermit',
      permitId: permit.id,
      decision: 'rejected',
      decisionNote: 'Silakan hadir pada sesi berikutnya.',
    },
    env.auth('assistant-a'),
  );
  const attendance = await env.call(
    { action: 'checkIn', classId, sessionId },
    env.auth('student-a'),
  );
  const attendanceRetry = await env.call(
    { action: 'checkIn', classId, sessionId },
    env.auth('student-a'),
  );
  assert.deepEqual(attendanceRetry, attendance);
  assert.equal(
    env.db.store.get(`attendances/${sessionId}~student-a`).studentNameSnapshot,
    'Dewi Putri',
  );
  await env.call({ action: 'closeSession', classId, sessionId }, env.auth('assistant-a'));
  const review = await env.call(
    { action: 'submitReview', classId, sessionId, text: 'Praktikum berjalan jelas dan tertata.' },
    env.auth('student-a'),
  );
  const reviewData = env.db.store.get(`reviews/${review.id}`);
  const jobData = env.db.store.get(`reviewJobs/${review.id}`);
  const summaryData = env.db.store.get(`reviewSummaries/${sessionId}`);
  assert.equal(reviewData.analysisStatus, 'pending');
  assert.equal(jobData.state, 'pending');
  assert.equal(summaryData.totalSubmitted, 1);
  assert.equal(summaryData.positiveCount, 0);
});

test('student lookup is exact, private, and limited to 20 calls per minute', async () => {
  const env = setup();
  env.addAssistant('assistant-a');
  await env.call(
    { action: 'completeProfile', displayName: 'Dewi Putri', nim: '2026001' },
    env.auth('student-a'),
  );
  const p = await env.call(
    { action: 'createPracticum', name: 'Biologi', requestId: 'p' },
    env.auth('assistant-a'),
  );
  const c = await env.call(
    { action: 'createClass', practicumId: p.id, name: 'A', timeZone: 'UTC', requestId: 'c' },
    env.auth('assistant-a'),
  );
  const found = await env.call(
    { action: 'lookupStudent', classId: c.id, nim: '2026001' },
    env.auth('assistant-a'),
  );
  const missing = await env.call(
    { action: 'lookupStudent', classId: c.id, nim: '2026002' },
    env.auth('assistant-a'),
  );
  assert.deepEqual(found, { studentUid: 'student-a', displayName: 'Dewi Putri', nim: '2026001' });
  assert.deepEqual(missing, { studentUid: null, displayName: null, nim: null });
  for (let index = 0; index < 18; index += 1) {
    await env.call(
      { action: 'lookupStudent', classId: c.id, nim: '2026001' },
      env.auth('assistant-a'),
    );
  }
  await assert.rejects(
    env.call({ action: 'lookupStudent', classId: c.id, nim: '2026001' }, env.auth('assistant-a')),
    (err) => err instanceof DomainError && err.code === 'resource-exhausted',
  );
});
