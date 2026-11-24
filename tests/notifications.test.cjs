const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTypeScript } = require('./load-typescript.cjs');

test('sendExpoPushNotifications filters invalid tokens and sends valid batches', async () => {
  const sentPayloads = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sentPayloads.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  };

  try {
    const { sendExpoPushNotifications } = loadTypeScript('src/lib/notification-triggers.ts', {
      './notifications': { NOTIFICATION_CHANNEL_ID: 'labsync-alerts' },
      '@/lib/firebase': {},
      '@react-native-firebase/firestore': {},
    });

    // Valid and invalid tokens
    const messages = [
      { to: 'ExponentPushToken[abc12345]', title: 'Test 1', body: 'Body 1' },
      { to: 'invalid-token-string', title: 'Test 2', body: 'Body 2' },
      { to: 'ExponentPushToken[def67890]', title: 'Test 3', body: 'Body 3' },
    ];

    await sendExpoPushNotifications(messages);

    assert.equal(sentPayloads.length, 1);
    assert.equal(sentPayloads[0].url, 'https://exp.host/--/api/v2/push/send');
    assert.equal(sentPayloads[0].body.length, 2);
    assert.equal(sentPayloads[0].body[0].to, 'ExponentPushToken[abc12345]');
    assert.equal(sentPayloads[0].body[1].to, 'ExponentPushToken[def67890]');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('notifySessionOpened fetches active students and sends session opened push notifications', async () => {
  const sentPayloads = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sentPayloads.push(JSON.parse(options.body));
    return { ok: true, status: 200 };
  };

  try {
    const mockDb = {};
    const mockStore = {
      'classes/class-1': { name: 'Basis Data A' },
      'classes/class-1/sessions/session-1': { moduleTitle: 'Modul 2 SQL Query' },
      'pushTokens/student-1': { enabled: true, token: 'ExponentPushToken[student-1-token]' },
      'pushTokens/student-2': { enabled: false, token: 'ExponentPushToken[student-2-disabled]' },
      'pushTokens/student-3': { enabled: true, token: 'ExponentPushToken[student-3-token]' },
    };

    const mockEnrollments = [
      { data: () => ({ studentUid: 'student-1', status: 'active' }) },
      { data: () => ({ studentUid: 'student-2', status: 'active' }) },
      { data: () => ({ studentUid: 'student-3', status: 'active' }) },
    ];

    const mockFirestore = {
      collection: (_db, col) => col,
      query: (col, ..._filters) => col,
      where: () => ({}),
      getDocs: async () => mockEnrollments,
      doc: (_db, ...parts) => parts.join('/'),
      getDoc: async (path) => ({
        exists: () => path in mockStore,
        data: () => mockStore[path],
      }),
    };

    const { notifySessionOpened } = loadTypeScript('src/lib/notification-triggers.ts', {
      './notifications': { NOTIFICATION_CHANNEL_ID: 'labsync-alerts' },
      '@/lib/firebase': { db: mockDb },
      '@react-native-firebase/firestore': mockFirestore,
    });

    await notifySessionOpened({ classId: 'class-1', sessionId: 'session-1' });

    assert.equal(sentPayloads.length, 1);
    const batch = sentPayloads[0];
    assert.equal(batch.length, 2); // student-1 and student-3 (student-2 is disabled)
    assert.equal(batch[0].to, 'ExponentPushToken[student-1-token]');
    assert.equal(batch[0].title, 'Sesi Praktikum Dibuka');
    assert.match(batch[0].body, /Modul 2 SQL Query/);
    assert.match(batch[0].body, /Basis Data A/);
    assert.equal(batch[0].data.type, 'session_opened');
    assert.equal(batch[0].data.url, '/praktikan/presensi?classId=class-1&sessionId=session-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('notifySessionUpdated sends cancelled and updated notifications', async () => {
  const sentPayloads = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sentPayloads.push(JSON.parse(options.body));
    return { ok: true, status: 200 };
  };

  try {
    const mockStore = {
      'classes/class-1': { name: 'Algoritma Pemrograman' },
      'classes/class-1/sessions/session-2': { moduleTitle: 'Modul 3 Sorting' },
      'pushTokens/student-1': { enabled: true, token: 'ExponentPushToken[student-1-token]' },
    };

    const mockFirestore = {
      collection: () => 'enrollments',
      query: () => 'query',
      where: () => ({}),
      getDocs: async () => [{ data: () => ({ studentUid: 'student-1', status: 'active' }) }],
      doc: (_db, ...parts) => parts.join('/'),
      getDoc: async (path) => ({
        exists: () => path in mockStore,
        data: () => mockStore[path],
      }),
    };

    const { notifySessionUpdated } = loadTypeScript('src/lib/notification-triggers.ts', {
      './notifications': { NOTIFICATION_CHANNEL_ID: 'labsync-alerts' },
      '@/lib/firebase': { db: {} },
      '@react-native-firebase/firestore': mockFirestore,
    });

    // Test updateSession
    await notifySessionUpdated({
      classId: 'class-1',
      sessionId: 'session-2',
      action: 'updateSession',
    });
    assert.equal(sentPayloads.length, 1);
    assert.equal(sentPayloads[0][0].title, 'Jadwal Praktikum Diperbarui');
    assert.match(sentPayloads[0][0].body, /Modul 3 Sorting/);
    assert.equal(sentPayloads[0][0].data.type, 'session_updated');

    // Test cancelSession
    await notifySessionUpdated({
      classId: 'class-1',
      sessionId: 'session-2',
      action: 'cancelSession',
    });
    assert.equal(sentPayloads.length, 2);
    assert.equal(sentPayloads[1][0].title, 'Sesi Praktikum Dibatalkan');
    assert.match(sentPayloads[1][0].body, /dibatalkan/);
    assert.equal(sentPayloads[1][0].data.type, 'session_cancelled');
    assert.equal(sentPayloads[1][0].data.url, '/jadwal');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('notifyPermitDecided sends approval or rejection notification to student', async () => {
  const sentPayloads = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sentPayloads.push(JSON.parse(options.body));
    return { ok: true, status: 200 };
  };

  try {
    const mockStore = {
      'permits/permit-1': {
        classId: 'class-1',
        sessionId: 'session-1',
        studentUid: 'student-99',
        sessionSnapshot: { moduleTitle: 'Modul 1 Git & GitHub' },
      },
      'pushTokens/student-99': {
        enabled: true,
        token: 'ExponentPushToken[student-99-token]',
      },
    };

    const mockFirestore = {
      doc: (_db, ...parts) => parts.join('/'),
      getDoc: async (path) => ({
        exists: () => path in mockStore,
        data: () => mockStore[path],
      }),
    };

    const { notifyPermitDecided } = loadTypeScript('src/lib/notification-triggers.ts', {
      './notifications': { NOTIFICATION_CHANNEL_ID: 'labsync-alerts' },
      '@/lib/firebase': { db: {} },
      '@react-native-firebase/firestore': mockFirestore,
    });

    // Test approved
    await notifyPermitDecided({
      permitId: 'permit-1',
      decision: 'approved',
    });
    assert.equal(sentPayloads.length, 1);
    assert.equal(sentPayloads[0][0].to, 'ExponentPushToken[student-99-token]');
    assert.equal(sentPayloads[0][0].title, 'Izin Praktikum Disetujui');
    assert.match(sentPayloads[0][0].body, /disetujui/);

    // Test rejected with note
    await notifyPermitDecided({
      permitId: 'permit-1',
      decision: 'rejected',
      decisionNote: 'Surat dokter tidak dilampirkan',
    });
    assert.equal(sentPayloads.length, 2);
    assert.equal(sentPayloads[1][0].title, 'Izin Praktikum Ditolak');
    assert.match(sentPayloads[1][0].body, /ditolak/);
    assert.match(sentPayloads[1][0].body, /Surat dokter tidak dilampirkan/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
