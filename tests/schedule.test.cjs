const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTypeScript } = require('./load-typescript.cjs');

class Timestamp {
  constructor(milliseconds) {
    this.milliseconds = milliseconds;
  }
  static fromMillis(milliseconds) {
    return new Timestamp(milliseconds);
  }
  toMillis() {
    return this.milliseconds;
  }
  toDate() {
    return new Date(this.milliseconds);
  }
}

function setup() {
  const listeners = [];
  const dependencies = {
    '@/lib/firebase': { db: {} },
    '@react-native-firebase/firestore': {
      Timestamp,
      collection: (_db, ...segments) => ({ kind: 'collection', path: segments.join('/') }),
      doc: (_db, ...segments) => ({ kind: 'document', path: segments.join('/') }),
      documentId: () => '__name__',
      where: (field, operator, value) => ({ kind: 'where', field, operator, value }),
      orderBy: (field, direction) => ({ kind: 'orderBy', field, direction }),
      query: (target, ...constraints) => ({ kind: 'query', target, constraints }),
      onSnapshot: (target, next, error) => {
        const listener = { target, next, error, stopped: false };
        listeners.push(listener);
        return () => {
          listener.stopped = true;
        };
      },
    },
  };
  dependencies['./time'] = loadTypeScript('src/features/academic/time.ts');
  const api = loadTypeScript('src/features/academic/listeners.ts', dependencies);
  return { ...api, listeners };
}

const classData = (overrides = {}) => ({
  assistantUid: 'assistant-a',
  name: 'IF-3A',
  timeZone: 'Asia/Jakarta',
  status: 'active',
  unfinishedSessionCount: 1,
  ...overrides,
});

const sessionData = (overrides = {}) => ({
  assistantUid: 'assistant-a',
  moduleTitle: 'Modul 1',
  room: 'Lab 1',
  startsAt: new Timestamp(Date.parse('2026-11-15T01:00:00.000Z')),
  endsAt: new Timestamp(Date.parse('2026-11-15T03:00:00.000Z')),
  status: 'scheduled',
  openedAt: null,
  closedAt: null,
  cancelledAt: null,
  ...overrides,
});

const classSnapshot = (id, data, fromCache = false) => ({
  kind: 'document',
  path: `classes/${id}`,
  exists: () => data != null,
  id,
  data: () => data,
  metadata: { fromCache },
});
const querySnapshot = (docs, fromCache = false) => ({
  docs: docs.map(([id, data]) => ({ id, data: () => data })),
  metadata: { fromCache },
});

function emit(listener, docs, fromCache = false) {
  listener.next(querySnapshot(docs, fromCache));
}
function emitDocument(listener, id, data, fromCache = false) {
  listener.next(classSnapshot(id, data, fromCache));
}
function findListener(listeners, matcher, start = 0) {
  const listener = listeners.slice(start).find(matcher);
  assert.ok(listener, `expected listener after index ${start}`);
  return listener;
}
function isQuery(listener) {
  return listener.target.kind === 'query';
}
function collectionPath(listener) {
  return listener.target.target?.path ?? '';
}
function docPath(listener) {
  return listener.target.path ?? '';
}

async function subscribe(role, uid = 'account-a', cancelImmediately = false) {
  const sdk = setup();
  const states = [],
    errors = [];
  const stop = sdk.subscribeSchedule(
    uid,
    role,
    (value) => states.push(value),
    (error) => errors.push(error),
  );
  if (cancelImmediately) stop();
  await new Promise((resolve) => setImmediate(resolve));
  return {
    ...sdk,
    states,
    errors,
    stop,
    get latest() {
      return states.at(-1);
    },
  };
}

test('nested session parser accepts v2 statuses and rejects malformed data', () => {
  const { parseAcademicSession } = setup();
  const classInfo = {
    id: 'class-a',
    name: 'IF-3A',
    timeZone: 'Asia/Jakarta',
  };
  for (const status of ['scheduled', 'open', 'closed', 'cancelled']) {
    assert.equal(
      parseAcademicSession('session-a', sessionData({ status }), classInfo).status,
      status,
    );
  }
  const parsed = parseAcademicSession('session-a', sessionData(), classInfo);
  assert.equal(parsed.date, '2026-11-15');
  assert.equal(parsed.endDate, '2026-11-15');
  assert.equal(parsed.startTime, '08:00');
  assert.equal(parsed.classId, 'class-a');
  for (const invalid of [
    { moduleTitle: '' },
    { room: '' },
    { startsAt: null },
    { endsAt: new Timestamp(Date.parse('2026-11-15T00:00:00.000Z')) },
    { status: 'DIBUKA' },
  ]) {
    assert.throws(() => parseAcademicSession('session-a', sessionData(invalid), classInfo));
  }
});

test('assistant reads only their classes and receives sorted nested session updates', async () => {
  const s = await subscribe('asisten', 'assistant-a');
  const classQuery = s.listeners[0];
  assert.equal(collectionPath(classQuery), 'classes');
  assert.deepEqual(classQuery.target.constraints, [
    { kind: 'where', field: 'assistantUid', operator: '==', value: 'assistant-a' },
  ]);

  emit(classQuery, [['class-a', classData()]]);
  assert.ok(s.listeners.every(isQuery), 'advisor class query supplies its own documents');
  const sessionQuery = findListener(
    s.listeners,
    (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions',
  );
  assert.deepEqual(
    sessionQuery.target.constraints.slice(0, 2).map(({ field, operator }) => ({ field, operator })),
    [
      { field: 'startsAt', operator: '>=' },
      { field: 'startsAt', operator: '<=' },
    ],
  );
  assert.deepEqual(sessionQuery.target.constraints.at(-1), {
    kind: 'orderBy',
    field: 'startsAt',
    direction: 'asc',
  });
  emit(
    sessionQuery,
    [
      [
        'later',
        sessionData({
          startsAt: new Timestamp(Date.parse('2026-11-15T04:00:00Z')),
          endsAt: new Timestamp(Date.parse('2026-11-15T05:00:00Z')),
        }),
      ],
      ['earlier', sessionData()],
    ],
    true,
  );
  assert.deepEqual(
    s.latest.sessions.map((item) => item.id),
    ['earlier', 'later'],
  );
  assert.equal(s.latest.loading, false);
  emit(sessionQuery, [['earlier', sessionData({ status: 'open' })]]);
  assert.equal(s.latest.sessions[0].status, 'open');
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
  assert.deepEqual(s.latest, { sessions: [], loading: false });
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
  const sessionsA = findListener(
    s.listeners,
    (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions',
  );
  const sessionsB = findListener(
    s.listeners,
    (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-b/sessions',
  );
  emit(sessionsB, [['session-b', sessionData()]], true);
  assert.equal(s.latest.loading, true);
  emit(sessionsA, [
    ['session-a', sessionData({ startsAt: new Timestamp(Date.parse('2026-11-15T00:00:00Z')) })],
  ]);
  assert.deepEqual(
    s.latest.sessions.map((item) => item.id),
    ['session-a', 'session-b'],
  );
  assert.equal(s.latest.loading, false);
  s.stop();
  assert.ok(s.listeners.every((listener) => listener.stopped));
});

test('archived classes stop contributing to the live schedule', async () => {
  const s = await subscribe('asisten', 'assistant-a');
  emit(s.listeners[0], [['class-a', classData()]]);
  const sessions = findListener(
    s.listeners,
    (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions',
  );
  emit(sessions, [['session-a', sessionData()]]);
  assert.equal(s.latest.sessions.length, 1);
  emit(s.listeners[0], [['class-a', classData({ status: 'archived' })]]);
  assert.deepEqual(s.latest.sessions, []);
  assert.equal(sessions.stopped, true);
  const count = s.states.length;
  emit(sessions, [['stale-session', sessionData()]], true);
  assert.equal(s.states.length, count);
  s.stop();
});

test('updates to session counts do not restart the session listener', async () => {
  const s = await subscribe('asisten', 'assistant-a');
  emit(s.listeners[0], [['class-a', classData()]], true);
  const sessions = findListener(
    s.listeners,
    (listener) => collectionPath(listener) === 'classes/class-a/sessions',
  );
  emit(sessions, [['session-a', sessionData()]]);
  const listenerCount = s.listeners.length;

  emit(s.listeners[0], [['class-a', classData({ unfinishedSessionCount: 3 })]]);
  assert.equal(s.listeners.length, listenerCount);
  assert.equal(sessions.stopped, false);
  assert.equal(s.latest.loading, false);
  s.stop();
});

test('removed enrollment unsubscribes the class and ignores its late cached sessions', async () => {
  const s = await subscribe('praktikan', 'student-a');
  const enrollments = s.listeners[0];
  emit(enrollments, [['class-a~student-a', { classId: 'class-a' }]]);
  const classDoc = findListener(s.listeners, (listener) => docPath(listener) === 'classes/class-a');
  emitDocument(classDoc, 'class-a', classData());
  const sessions = findListener(
    s.listeners,
    (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions',
  );
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
  const sessionQuery = findListener(
    s.listeners,
    (listener) => isQuery(listener) && collectionPath(listener) === 'classes/class-a/sessions',
  );
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

test('schedule separates open and scheduled sessions from completed or cancelled sessions', () => {
  const { groupSchedule } = loadTypeScript('src/features/academic/time.ts');
  const session = (id, status, time) => ({ id, status, startsAt: new Timestamp(time) });

  const groups = groupSchedule(
    [
      session('completed', 'closed', 1),
      session('late', 'scheduled', 2),
      session('live', 'open', 3),
      session('next', 'scheduled', 4),
      session('cancelled', 'cancelled', 5),
    ],
    3,
  );

  assert.deepEqual(
    groups.open.map((item) => item.id),
    ['live'],
  );
  assert.deepEqual(
    groups.upcoming.map((item) => item.id),
    ['next'],
  );
  assert.deepEqual(
    groups.overdue.map((item) => item.id),
    ['late'],
  );
  assert.deepEqual(
    groups.past.map((item) => item.id),
    ['cancelled', 'completed'],
  );
});

test('session review summary watches only the selected session owned by the assistant', async () => {
  const { listeners, subscribeSessionReviewSummary } = setup();
  const summaries = [];
  const stop = subscribeSessionReviewSummary(
    'assistant-a',
    'class-a',
    'session-a',
    (value) => summaries.push(value),
    assert.fail,
  );
  await new Promise(setImmediate);
  const listener = findListener(listeners, (entry) => collectionPath(entry) === 'reviewSummaries');
  assert.deepEqual(
    listener.target.constraints.map(({ field, operator, value }) => [field, operator, value]),
    [
      ['assistantUid', '==', 'assistant-a'],
      ['classId', '==', 'class-a'],
      ['__name__', '==', 'session-a'],
    ],
  );
  emit(listener, []);
  assert.equal(summaries.at(-1).totalSubmitted, 0);
  emit(listener, [['session-a', { totalSubmitted: 3, positiveCount: 1, failedCount: 1 }]]);
  assert.equal(summaries.at(-1).pendingCount, 1);
  stop();
  assert.equal(listener.stopped, true);
});

test('session detail watches one session and uses the class already loaded by the app', async () => {
  const { listeners, subscribeAssistantSession } = setup();
  let value;
  const stop = subscribeAssistantSession(
    { id: 'class-a', name: 'IF-3A', timeZone: 'Asia/Jakarta' },
    'session-a',
    (session) => {
      value = session;
    },
    assert.fail,
  );
  await new Promise(setImmediate);
  assert.equal(listeners.length, 1);
  const [listener] = listeners;
  assert.equal(collectionPath(listener), 'classes/class-a/sessions');
  assert.deepEqual(listener.target.constraints, [
    { kind: 'where', field: '__name__', operator: '==', value: 'session-a' },
  ]);
  emit(listener, [['session-a', sessionData({ status: 'closed' })]]);
  assert.equal(value.className, 'IF-3A');
  assert.equal(value.status, 'closed');
  stop();
  assert.equal(listener.stopped, true);
});
