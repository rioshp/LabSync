const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

class Timestamp {
  constructor(seconds = 1000) {
    this.seconds = seconds;
  }
  toMillis() {
    return this.seconds * 1000;
  }
}

function setup({ updateError } = {}) {
  const listeners = [];
  const updates = [];
  const dependencies = {
    './firebase': { db: 'db-instance' },
    '@react-native-firebase/firestore': {
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
      updateDoc: async (ref, payload) => {
        updates.push({ ref, payload });
        if (updateError) throw updateError;
      },
    },
  };

  const source = fs.readFileSync(path.join(__dirname, '../src/lib/permits.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) { ${outputText}\n})`)(
    (name) => dependencies[name],
    module,
    module.exports,
  );
  return { ...module.exports, listeners, updates, Timestamp };
}

const validPermit = {
  sessionId: 'session-1',
  sessionInfo: {
    practicum: 'Basis Data',
    module: 'Modul 2',
    className: 'IF-3A',
    date: '2026-11-16',
  },
  studentId: 'student-1',
  studentName: 'Budi Santoso',
  nim: '220101010',
  reason: 'Sakit demam tinggi disertai surat keterangan dokter.',
  status: 'pending',
  reviewedBy: null,
  reviewNote: null,
  submittedAt: new Timestamp(200),
};

function emit(listener, docs) {
  listener.next({
    docs: docs.map(([id, data]) => ({ id, data: () => data })),
  });
}

test('parsePermit validates permit fields and fills missing className from session fallback', () => {
  const sdk = setup();
  const parsed = sdk.parsePermit(
    'permit-1',
    {
      ...validPermit,
      sessionInfo: { practicum: 'Basis Data', module: 'Modul 2', date: '2026-11-16' },
    },
    { className: 'IF-3B' },
  );
  assert.equal(parsed.id, 'permit-1');
  assert.equal(parsed.sessionInfo.className, 'IF-3B');
  assert.equal(parsed.status, 'pending');

  assert.throws(
    () => sdk.parsePermit('bad', { ...validPermit, status: 'invalid' }),
    /Status pengajuan izin tidak valid/,
  );
  assert.throws(
    () => sdk.parsePermit('bad', { ...validPermit, reason: '   ' }),
    /Data pengajuan izin belum lengkap/,
  );
});

test('subscribeAssistantPermits watches assistant sessions and aggregates realtime permits sorted by newest', async () => {
  const sdk = setup();
  const states = [];
  const errors = [];
  const stop = sdk.subscribeAssistantPermits(
    'assistant-1',
    (state) => states.push(state),
    (err) => errors.push(err),
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sdk.listeners.length, 1);
  emit(sdk.listeners[0], [
    ['session-1', { className: 'IF-3A', practicum: 'Basis Data', module: 'Modul 1', date: '2026-11-16' }],
    ['session-2', { className: 'IF-3B', practicum: 'Basis Data', module: 'Modul 2', date: '2026-11-17' }],
  ]);

  assert.equal(sdk.listeners.length, 3);
  emit(sdk.listeners[1], [
    ['permit-older', { ...validPermit, sessionId: 'session-1', submittedAt: new Timestamp(100) }],
  ]);
  emit(sdk.listeners[2], [
    ['permit-newer', { ...validPermit, sessionId: 'session-2', submittedAt: new Timestamp(300) }],
  ]);

  assert.equal(errors.length, 0);
  const latest = states.at(-1);
  assert.equal(latest.loading, false);
  assert.deepEqual(
    latest.permits.map((p) => p.id),
    ['permit-newer', 'permit-older'],
  );

  stop();
  assert.ok(sdk.listeners.every((l) => l.stopped));
});

test('reviewPermit approves with optional note and requires a rejection note when rejecting', async () => {
  const sdk = setup();

  await assert.rejects(
    () =>
      sdk.reviewPermit('permit-1', {
        status: 'rejected',
        reviewedBy: 'assistant-1',
        reviewNote: '   ',
      }),
    /Catatan penolakan wajib diisi/,
  );
  assert.equal(sdk.updates.length, 0);

  await sdk.reviewPermit('permit-1', {
    status: 'approved',
    reviewedBy: 'assistant-1',
    reviewNote: '   ',
  });
  assert.deepEqual(sdk.updates[0], {
    ref: { collection: 'permits', id: 'permit-1' },
    payload: {
      status: 'approved',
      reviewedBy: 'assistant-1',
      reviewNote: null,
    },
  });

  await sdk.reviewPermit('permit-2', {
    status: 'rejected',
    reviewedBy: 'assistant-1',
    reviewNote: ' Surat dokter belum dilampirkan ',
  });
  assert.deepEqual(sdk.updates[1], {
    ref: { collection: 'permits', id: 'permit-2' },
    payload: {
      status: 'rejected',
      reviewedBy: 'assistant-1',
      reviewNote: 'Surat dokter belum dilampirkan',
    },
  });
});
