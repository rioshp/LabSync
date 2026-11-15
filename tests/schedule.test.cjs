const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

class Timestamp {}

function setup() {
  const listeners = [];
  const dependencies = {
    './firebase': { db: {} },
    '@react-native-firebase/firestore': {
      Timestamp,
      collection: (_db, name) => ({ collection: name }),
      where: (field, operator, value) => ({ field, operator, value }),
      query: (collection, ...filters) => ({ ...collection, filters }),
      onSnapshot: (query, next, error) => {
        const listener = { query, next, error, stopped: false };
        listeners.push(listener);
        return () => { listener.stopped = true; };
      },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/schedule.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) { ${outputText}\n})`)(
    (name) => dependencies[name], module, module.exports,
  );
  return { ...module.exports, listeners };
}

const valid = {
  classId: 'class-a', className: 'IF-3A', practicum: 'Basis Data', module: 'Modul 1',
  room: 'Lab 1', date: '2026-11-15', startTime: '08:00', endTime: '10:00',
  status: 'upcoming', assistantId: 'assistant-a', openedAt: null,
};

function emit(listener, docs) {
  listener.next({ docs: docs.map(([id, data]) => ({ id, data: () => data })) });
}

async function subscribe(role, uid = 'account-a', cancelImmediately = false) {
  const sdk = setup();
  const states = [], errors = [];
  const stop = sdk.subscribeSchedule(uid, role, (value) => states.push(value), (error) => errors.push(error));
  if (cancelImmediately) stop();
  await new Promise((resolve) => setImmediate(resolve));
  return { ...sdk, states, errors, stop, get latest() { return states.at(-1); } };
}

test('session contract accepts Sprint 2 statuses and rejects malformed data', () => {
  const { parseSession } = setup();
  for (const status of ['upcoming', 'open', 'closed']) {
    assert.equal(parseSession('session-a', { ...valid, status }).status, status);
  }
  assert.equal(parseSession('session-a', { ...valid, openedAt: new Timestamp() }).id, 'session-a');
  for (const invalid of [
    { module: '' }, { classId: null }, { assistantId: '' }, { date: 'Jumat' },
    { startTime: '25:00' }, { endTime: '10.00' }, { status: 'DIBUKA' },
    { status: ['open'] }, { openedAt: 'now' },
  ]) {
    assert.throws(() => parseSession('session-a', { ...valid, ...invalid }));
  }
});

test('assistant listens only to their own sessions and receives sorted realtime changes', async () => {
  const s = await subscribe('asisten', 'assistant-a');
  assert.equal(s.listeners.length, 1);
  assert.deepEqual(s.listeners[0].query, {
    collection: 'sessions', filters: [{ field: 'assistantId', operator: '==', value: 'assistant-a' }],
  });
  emit(s.listeners[0], [
    ['later', { ...valid, startTime: '11:00', endTime: '13:00' }],
    ['earlier', valid],
  ]);
  assert.deepEqual(s.latest.sessions.map((item) => item.id), ['earlier', 'later']);
  assert.equal(s.latest.loading, false);
  emit(s.listeners[0], [['earlier', { ...valid, status: 'open' }]]);
  assert.equal(s.latest.sessions[0].status, 'open');
  s.stop();
  assert.equal(s.listeners[0].stopped, true);
});

test('student without classes gets an empty state without reading all sessions', async () => {
  const s = await subscribe('praktikan', 'student-a');
  assert.deepEqual(s.listeners[0].query, {
    collection: 'classes', filters: [{ field: 'studentIds', operator: 'array-contains', value: 'student-a' }],
  });
  emit(s.listeners[0], []);
  assert.equal(s.listeners.length, 1);
  assert.deepEqual(s.latest, { sessions: [], loading: false });
  s.stop();
});

test('student combines only enrolled class sessions and waits for each initial snapshot', async () => {
  const s = await subscribe('praktikan');
  emit(s.listeners[0], [['class-b', {}], ['class-a', {}]]);
  assert.deepEqual(s.listeners.slice(1).map((listener) => listener.query.filters), [
    [{ field: 'classId', operator: '==', value: 'class-a' }],
    [{ field: 'classId', operator: '==', value: 'class-b' }],
  ]);
  emit(s.listeners[2], [['session-b', { ...valid, classId: 'class-b', date: '2026-11-16' }]]);
  assert.equal(s.latest.loading, true);
  emit(s.listeners[1], [['session-a', valid]]);
  assert.deepEqual(s.latest.sessions.map((item) => item.id), ['session-a', 'session-b']);
  emit(s.listeners[1], [['session-a', { ...valid, status: 'closed' }]]);
  assert.equal(s.latest.sessions[0].status, 'closed');
  s.stop();
  assert.ok(s.listeners.every((listener) => listener.stopped));
});

test('class membership changes clear stale data, unsubscribe, and ignore late callbacks', async () => {
  const s = await subscribe('praktikan');
  emit(s.listeners[0], [['class-a', {}]]);
  const previous = s.listeners[1];
  emit(previous, [['session-a', valid]]);
  emit(s.listeners[0], [['class-a', { name: 'renamed' }]]);
  assert.equal(s.listeners.length, 2);
  emit(s.listeners[0], [['class-b', {}]]);
  assert.equal(previous.stopped, true);
  assert.deepEqual(s.latest.sessions, []);
  emit(previous, [['stale', valid]]);
  assert.deepEqual(s.latest.sessions, []);
  previous.error({ code: 'firestore/permission-denied' });
  assert.deepEqual(s.errors, []);
  assert.equal(s.listeners[2].stopped, false);
  emit(s.listeners[2], [['session-b', { ...valid, classId: 'class-b' }]]);
  assert.equal(s.latest.sessions[0].id, 'session-b');
  emit(s.listeners[0], []);
  assert.equal(s.listeners[2].stopped, true);
  assert.deepEqual(s.latest, { sessions: [], loading: false });
  s.stop();
});

test('subscription errors stop all listeners and prevent stale data from reappearing', async () => {
  const s = await subscribe('praktikan');
  emit(s.listeners[0], [['class-a', {}], ['class-b', {}]]);
  const denied = { code: 'firestore/permission-denied' };
  s.listeners[1].error(denied);
  assert.deepEqual(s.errors, [denied]);
  assert.ok(s.listeners.every((listener) => listener.stopped));
  const count = s.states.length;
  emit(s.listeners[2], [['late', valid]]);
  assert.equal(s.states.length, count);
  s.stop();
});

test('invalid session data surfaces a failure instead of silently hiding the record', async () => {
  const s = await subscribe('asisten');
  emit(s.listeners[0], [['invalid', { ...valid, module: '' }]]);
  assert.match(s.errors[0].message, /Data jadwal belum lengkap/);
  assert.equal(s.listeners[0].stopped, true);
});

test('cancel before Firebase loads never attaches a listener', async () => {
  const s = await subscribe('asisten', 'assistant-a', true);
  assert.deepEqual(s.listeners, []);
  assert.deepEqual(s.errors, []);
});
