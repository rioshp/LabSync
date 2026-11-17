const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

class Timestamp {
  constructor(seconds = 1700000000) {
    this.seconds = seconds;
  }
  toMillis() {
    return this.seconds * 1000;
  }
}

function setup() {
  const listeners = [];
  const firestoreMock = {
    Timestamp,
    collection: (_db, name) => ({ collection: name }),
    doc: (_db, name, id) => ({ collection: name, id }),
    where: (field, operator, value) => ({ field, operator, value }),
    query: (col, ...filters) => ({ ...col, filters }),
    onSnapshot: (q, next, error) => {
      const listener = { query: q, next, error, stopped: false };
      listeners.push(listener);
      return () => {
        listener.stopped = true;
      };
    },
    updateDoc: async () => {},
  };

  function transpile(relPath, deps) {
    const source = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const mod = { exports: {} };
    vm.runInThisContext(`(function(require, module, exports) { ${outputText}\n})`)(
      (name) => deps[name],
      mod,
      mod.exports,
    );
    return mod.exports;
  }

  const permitsMod = transpile('src/lib/permits.ts', {
    './firebase': { db: 'db-instance' },
    '@react-native-firebase/firestore': firestoreMock,
  });

  const historyMod = transpile('src/lib/history.ts', {
    './firebase': { db: 'db-instance' },
    './permits': permitsMod,
    '@react-native-firebase/firestore': firestoreMock,
  });

  return { ...historyMod, listeners, Timestamp };
}

function emit(listener, docs) {
  listener.next({
    docs: docs.map(([id, data]) => ({ id, data: () => data })),
  });
}

test('parseAttendance extracts sessionInfo or falls back to schedule map', () => {
  const sdk = setup();
  const direct = sdk.parseAttendance('att-1', {
    sessionId: 'sesi-1',
    sessionInfo: {
      practicum: 'Pemrograman Perangkat Bergerak',
      module: 'Modul 2',
      className: 'IF-5A',
    },
    studentId: 'student-1',
    studentName: 'Siti Aminah',
    nim: '220101011',
    checkedInAt: new Timestamp(1000),
  });
  assert.equal(direct.sessionInfo.practicum, 'Pemrograman Perangkat Bergerak');
  assert.equal(direct.sessionInfo.className, 'IF-5A');

  const withFallback = sdk.parseAttendance(
    'att-2',
    {
      sessionId: 'sesi-2',
      studentId: 'student-1',
      studentName: 'Siti Aminah',
      nim: '220101011',
      checkedInAt: new Timestamp(2000),
    },
    { practicum: 'Basis Data', module: 'Modul 3', className: 'IF-3B' },
  );
  assert.equal(withFallback.sessionInfo.practicum, 'Basis Data');
  assert.equal(withFallback.sessionInfo.module, 'Modul 3');
  assert.equal(withFallback.sessionInfo.className, 'IF-3B');
});

test('subscribeStudentHistory waits for both attendances and permits snapshots and sorts newest first', async () => {
  const sdk = setup();
  const states = [];
  const errors = [];
  const sessionMap = new Map([
    ['sesi-1', { practicum: 'Basis Data', module: 'Modul 1', className: 'IF-3A', date: '2026-11-16' }],
  ]);

  const stop = sdk.subscribeStudentHistory(
    'student-1',
    (state) => states.push(state),
    (err) => errors.push(err),
    sessionMap,
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sdk.listeners.length, 2);
  emit(sdk.listeners[0], [
    [
      'att-older',
      {
        sessionId: 'sesi-1',
        studentId: 'student-1',
        studentName: 'Siti Aminah',
        nim: '220101011',
        checkedInAt: new Timestamp(100),
      },
    ],
    [
      'att-newer',
      {
        sessionId: 'sesi-1',
        studentId: 'student-1',
        studentName: 'Siti Aminah',
        nim: '220101011',
        checkedInAt: new Timestamp(500),
      },
    ],
  ]);

  // Still waiting for permits snapshot
  assert.equal(states.at(-1).loading, true);

  emit(sdk.listeners[1], [
    [
      'permit-1',
      {
        sessionId: 'sesi-1',
        studentId: 'student-1',
        studentName: 'Siti Aminah',
        nim: '220101011',
        reason: 'Izin mengikuti lomba tingkat nasional.',
        status: 'approved',
        reviewedBy: 'assistant-1',
        reviewNote: 'Disetujui, semangat lombanya.',
        submittedAt: new Timestamp(300),
      },
    ],
  ]);

  assert.equal(errors.length, 0);
  const latest = states.at(-1);
  assert.equal(latest.loading, false);
  assert.deepEqual(
    latest.attendances.map((a) => a.id),
    ['att-newer', 'att-older'],
  );
  assert.equal(latest.permits.length, 1);
  assert.equal(latest.permits[0].status, 'approved');
  assert.equal(latest.permits[0].reviewNote, 'Disetujui, semangat lombanya.');

  stop();
  assert.ok(sdk.listeners.every((l) => l.stopped));
});
