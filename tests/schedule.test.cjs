const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTypeScript } = require('./load-typescript.cjs');

class Timestamp {
  constructor(milliseconds) { this.milliseconds = milliseconds; }
  static fromMillis(milliseconds) { return new Timestamp(milliseconds); }
  toMillis() { return this.milliseconds; }
  toDate() { return new Date(this.milliseconds); }
}

function setup() {
  const listeners = [];
  const dependencies = {
    '@/lib/firebase': { db: {} },
    '@react-native-firebase/firestore': {
      Timestamp,
      collection: (_db, ...segments) => ({ kind: 'collection', path: segments.join('/') }),
      doc: (_db, ...segments) => ({ kind: 'document', path: segments.join('/') }),
      where: (field, operator, value) => ({ kind: 'where', field, operator, value }),
      orderBy: (field, direction) => ({ kind: 'orderBy', field, direction }),
      query: (target, ...constraints) => ({ kind: 'query', target, constraints }),
      onSnapshot: (target, optionsOrNext, nextOrError, error) => {
        const hasOptions = typeof optionsOrNext !== 'function';
        const listener = {
          target,
          options: hasOptions ? optionsOrNext : undefined,
          next: hasOptions ? nextOrError : optionsOrNext,
          error: hasOptions ? error : nextOrError,
          stopped: false,
        };
        listeners.push(listener);
        return () => { listener.stopped = true; };
      },
    },
  };
  const api = loadTypeScript('src/features/academic/listeners.ts', dependencies);
  return { ...api, listeners };
}

const classData = (overrides = {}) => ({
  practicumId: 'practicum-a', practicumName: 'Basis Data', assistantUid: 'assistant-a',
  name: 'IF-3A', timeZone: 'Asia/Jakarta', status: 'active', unfinishedSessionCount: 1,
  ...overrides,
});

const sessionData = (overrides = {}) => ({
  assistantUid: 'assistant-a', moduleTitle: 'Modul 1', room: 'Lab 1',
  startsAt: new Timestamp(Date.parse('2026-11-15T01:00:00.000Z')),
  endsAt: new Timestamp(Date.parse('2026-11-15T03:00:00.000Z')),
  status: 'scheduled', openedAt: null, closedAt: null, cancelledAt: null,
  ...overrides,
});

const classSnapshot = (id, data, fromCache = false) => ({ kind: 'document', path: `classes/${id}`, exists: () => data != null, id, data: () => data, metadata: { fromCache } });
const querySnapshot = (docs, fromCache = false) => ({ docs: docs.map(([id, data]) => ({ id, data: () => data })), metadata: { fromCache } });

function emit(listener, docs, fromCache = false) { listener.next(querySnapshot(docs, fromCache)); }
function emitDocument(listener, id, data, fromCache = false) { listener.next(classSnapshot(id, data, fromCache)); }
function findListener(listeners, matcher, start = 0) {
  const listener = listeners.slice(start).find(matcher);
  assert.ok(listener, `expected listener after index ${start}`);
  return listener;
}
function isQuery(listener) { return listener.target.kind === 'query'; }
function collectionPath(listener) { return listener.target.target?.path ?? ''; }
function docPath(listener) { return listener.target.path ?? ''; }

async function subscribe(role, uid = 'account-a', cancelImmediately = false) {
  const sdk = setup();
  const states = [], errors = [];
  const stop = sdk.subscribeSchedule(uid, role, (value) => states.push(value), (error) => errors.push(error));
  if (cancelImmediately) stop();
  await new Promise((resolve) => setImmediate(resolve));
  return { ...sdk, states, errors, stop, get latest() { return states.at(-1); } };
}

test('nested session parser accepts v2 statuses and rejects malformed data', () => {
  const { parseAcademicSession } = setup();
  const classInfo = { id: 'class-a', name: 'IF-3A', practicumName: 'Basis Data', timeZone: 'Asia/Jakarta' };
  for (const status of ['scheduled', 'open', 'closed', 'cancelled']) {
    assert.equal(parseAcademicSession('session-a', sessionData({ status }), classInfo).status, status);
  }
  const parsed = parseAcademicSession('session-a', sessionData(), classInfo);
  assert.equal(parsed.date, '2026-11-15');
  assert.equal(parsed.endDate, '2026-11-15');
  assert.equal(parsed.startTime, '08:00');
  assert.equal(parsed.classId, 'class-a');
  for (const invalid of [
    { moduleTitle: '' }, { assistantUid: '' }, { room: '' }, { startsAt: null },
    { endsAt: new Timestamp(Date.parse('2026-11-15T00:00:00.000Z')) }, { status: 'DIBUKA' },
    { openedAt: 'now' },
  ]) {
    assert.throws(() => parseAcademicSession('session-a', sessionData(invalid), classInfo));
  }
});

test('assistant reads only their classes and receives sorted nested session updates', async () => {
  const s = await subscribe('asisten', 'assistant-a');
  const classQuery = s.listeners[0];
  assert.equal(classQuery.options.includeMetadataChanges, true);
  assert.equal(collectionPath(classQuery), 'classes');
  assert.deepEqual(classQuery.target.constraints, [{ kind: 'where', field: 'assistantUid', operator: '==', value: 'assistant-a' }]);

  emit(classQuery, [['class-a', classData()]]);
  const classDoc = findListener(s.listeners, (listener) => docPath(listener) === 'classes/class-a');
  emitDocument(classDoc, 'class-a', classData());
  const sessionQuery = findListener(s.listeners, (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions');
  assert.deepEqual(sessionQuery.target.constraints.slice(0, 2).map(({ field, operator }) => ({ field, operator })), [
    { field: 'startsAt', operator: '>=' }, { field: 'startsAt', operator: '<=' },
  ]);
  assert.deepEqual(sessionQuery.target.constraints.at(-1), { kind: 'orderBy', field: 'startsAt', direction: 'asc' });
  emit(sessionQuery, [
    ['later', sessionData({ startsAt: new Timestamp(Date.parse('2026-11-15T04:00:00Z')), endsAt: new Timestamp(Date.parse('2026-11-15T05:00:00Z')) })],
    ['earlier', sessionData()],
  ], true);
  assert.deepEqual(s.latest.sessions.map((item) => item.id), ['earlier', 'later']);
  assert.equal(s.latest.loading, false);
  assert.equal(s.latest.offline, true);
  emit(sessionQuery, [['earlier', sessionData({ status: 'open' })]]);
  assert.equal(s.latest.sessions[0].status, 'open');
  assert.equal(s.latest.offline, false);
  emit(sessionQuery, [['earlier', sessionData({ status: 'open' })]], true);
  assert.equal(s.latest.offline, true);
  emit(sessionQuery, [['earlier', sessionData({ status: 'open' })]], false);
  assert.equal(s.latest.offline, false);
  s.stop();
  assert.ok(s.listeners.every((listener) => listener.stopped));
});

test('student with no active enrollment gets an empty schedule', async () => {
  const s = await subscribe('praktikan', 'student-a');
  assert.deepEqual(s.listeners[0].target.constraints, [
    { kind: 'where', field: 'studentUid', operator: '==', value: 'student-a' },
    { kind: 'where', field: 'status', operator: '==', value: 'active' },
  ]);
  emit(s.listeners[0], [], true);
  assert.equal(s.listeners.length, 1);
  assert.deepEqual(s.latest, { sessions: [], loading: false, offline: true });
  s.stop();
});

test('student schedule combines only active enrolled classes and updates in realtime', async () => {
  const s = await subscribe('praktikan', 'student-a');
  emit(s.listeners[0], [
    ['class-b~student-a', { classId: 'class-b' }],
    ['class-a~student-a', { classId: 'class-a' }],
  ]);
  const classA = findListener(s.listeners, (listener) => docPath(listener) === 'classes/class-a');
  const classB = findListener(s.listeners, (listener) => docPath(listener) === 'classes/class-b');
  emitDocument(classA, 'class-a', classData());
  emitDocument(classB, 'class-b', classData({ name: 'IF-3B' }));
  const sessionsA = findListener(s.listeners, (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions');
  const sessionsB = findListener(s.listeners, (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-b/sessions');
  emit(sessionsB, [['session-b', sessionData()]], true);
  assert.equal(s.latest.loading, true);
  emit(sessionsA, [['session-a', sessionData({ startsAt: new Timestamp(Date.parse('2026-11-15T00:00:00Z')) })]]);
  assert.deepEqual(s.latest.sessions.map((item) => item.id), ['session-a', 'session-b']);
  assert.equal(s.latest.loading, false);
  assert.equal(s.latest.offline, true);
  emit(sessionsB, [['session-b', sessionData()]], false);
  assert.equal(s.latest.offline, false);
  s.stop();
  assert.ok(s.listeners.every((listener) => listener.stopped));
});

test('archived classes stop contributing to the live schedule', async () => {
  const s = await subscribe('asisten', 'assistant-a');
  emit(s.listeners[0], [['class-a', classData()]]);
  const classDoc = findListener(s.listeners, (listener) => docPath(listener) === 'classes/class-a');
  emitDocument(classDoc, 'class-a', classData());
  const sessions = findListener(s.listeners, (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions');
  emit(sessions, [['session-a', sessionData()]]);
  assert.equal(s.latest.sessions.length, 1);
  emitDocument(classDoc, 'class-a', classData({ status: 'archived' }));
  assert.deepEqual(s.latest.sessions, []);
  assert.equal(sessions.stopped, true);
  const count = s.states.length;
  emit(sessions, [['stale-session', sessionData()]], true);
  assert.equal(s.states.length, count);
  s.stop();
});

test('class metadata changes do not restart the session listener', async () => {
  const s = await subscribe('asisten', 'assistant-a');
  emit(s.listeners[0], [['class-a', classData()]]);
  const classDoc = findListener(s.listeners, (listener) => docPath(listener) === 'classes/class-a');
  emitDocument(classDoc, 'class-a', classData(), true);
  const sessions = findListener(s.listeners, (listener) => collectionPath(listener) === 'classes/class-a/sessions');
  emit(sessions, [['session-a', sessionData()]]);
  const listenerCount = s.listeners.length;

  emitDocument(classDoc, 'class-a', classData());
  assert.equal(s.listeners.length, listenerCount);
  assert.equal(sessions.stopped, false);
  assert.equal(s.latest.loading, false);
  assert.equal(s.latest.offline, false);
  s.stop();
});

test('removed enrollment unsubscribes the class and ignores its late cached sessions', async () => {
  const s = await subscribe('praktikan', 'student-a');
  const enrollments = s.listeners[0];
  emit(enrollments, [['class-a~student-a', { classId: 'class-a' }]]);
  const classDoc = findListener(s.listeners, (listener) => docPath(listener) === 'classes/class-a');
  emitDocument(classDoc, 'class-a', classData());
  const sessions = findListener(s.listeners, (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions');
  emit(sessions, [['session-a', sessionData()]]);
  assert.equal(s.latest.sessions.length, 1);
  emit(enrollments, []);
  assert.deepEqual(s.latest.sessions, []);
  assert.equal(classDoc.stopped, true);
  assert.equal(sessions.stopped, true);
  const count = s.states.length;
  emit(sessions, [['stale', sessionData()]], true);
  assert.equal(s.states.length, count);
  s.stop();
});

test('subscription errors stop all listeners and prevent stale results from returning', async () => {
  const s = await subscribe('praktikan', 'student-a');
  emit(s.listeners[0], [['class-a~student-a', { classId: 'class-a' }]]);
  const classDoc = findListener(s.listeners, (listener) => docPath(listener) === 'classes/class-a');
  emitDocument(classDoc, 'class-a', classData());
  const sessionQuery = findListener(s.listeners, (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions');
  const denied = { code: 'firestore/permission-denied' };
  sessionQuery.error(denied);
  assert.deepEqual(s.errors, [denied]);
  assert.ok(s.listeners.every((listener) => listener.stopped));
  const count = s.states.length;
  emit(sessionQuery, [['late', sessionData()]]);
  assert.equal(s.states.length, count);
  s.stop();
});

test('cancel before Firebase loads never attaches a listener', async () => {
  const s = await subscribe('asisten', 'assistant-a', true);
  assert.deepEqual(s.listeners, []);
  assert.deepEqual(s.errors, []);
});
