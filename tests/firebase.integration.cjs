const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, test } = require('node:test');
const { createRequire } = require('node:module');
const backendRequire = createRequire(require.resolve('../functions/package.json'));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } =
  backendRequire('firebase-admin/app');
const { getAuth: getAdminAuth } = backendRequire('firebase-admin/auth');
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} = require('firebase/firestore');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');

const projectId = process.env.GCLOUD_PROJECT || 'demo-labsync';
const clients = [];
const runId = randomUUID().slice(0, 8);
const password = 'Test-labsync-2026!';
let admin;
let operator;
let assistant;
let otherAssistant;
let student;
let outsider;
let classId;
let practicumId;
let sessionId;
let permitSessionId;

function endpoint(name, fallback) {
  const [host, port] = (process.env[name] || fallback).split(':');
  return [host, Number(port)];
}

async function client(label, claims) {
  const email = label + '-' + runId + '@example.test';
  const account = await getAdminAuth(admin).createUser({
    email,
    password,
    emailVerified: true,
    displayName: label,
  });
  if (claims) await getAdminAuth(admin).setCustomUserClaims(account.uid, claims);
  const app = initializeApp({ projectId, apiKey: 'demo-only-key', appId: 'demo-' + label }, label);
  clients.push(app);
  const auth = getAuth(app);
  const [authHost, authPort] = endpoint('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
  connectAuthEmulator(auth, 'http://' + authHost + ':' + authPort, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, ...endpoint('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080'));
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, ...endpoint('FUNCTIONS_EMULATOR_HOST', '127.0.0.1:5001'));
  await signInWithEmailAndPassword(auth, email, password);
  const invoke = httpsCallable(functions, 'mutate');
  return {
    uid: account.uid,
    db,
    mutate: async (action, data = {}) => (await invoke({ ...data, action })).data,
  };
}

function observe(ref, matches, timeout = 12_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Realtime update timed out')), timeout);
    const stop = onSnapshot(
      ref,
      (snapshot) => {
        if (matches(snapshot)) finish(null, snapshot);
      },
      finish,
    );
    function finish(error, snapshot) {
      clearTimeout(timer);
      stop();
      if (error) reject(error);
      else resolve(snapshot);
    }
  });
}

const denied = (error) =>
  error.code === 'permission-denied' || error.code === 'functions/permission-denied';
const conflict = (error) =>
  error.code === 'functions/failed-precondition' || error.code === 'functions/already-exists';

before(
  async () => {
    if (
      !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      !process.env.FIRESTORE_EMULATOR_HOST ||
      !projectId.startsWith('demo-')
    ) {
      throw new Error('Run only against demo-labsync Emulator Suite.');
    }
    admin = initializeAdmin({ projectId });
    [operator, assistant, otherAssistant, student, outsider] = await Promise.all([
      client('operator', { labsyncOperator: true }),
      client('assistant'),
      client('other-assistant'),
      client('student'),
      client('outsider'),
    ]);
    for (const account of [assistant, otherAssistant]) {
      await operator.mutate('provisionAssistant', { uid: account.uid });
    }
    await student.mutate('completeProfile', { displayName: 'Praktikan A', nim: '260001' });
    await outsider.mutate('completeProfile', { displayName: 'Praktikan B', nim: '260002' });
  },
  { timeout: 60_000 },
);

after(async () => {
  await Promise.all(clients.map(deleteApp));
  if (admin) await deleteAdmin(admin);
});

test('Firestore and Functions enforce UID, role and authenticated onboarding', async () => {
  const profile = (await getDocFromServer(doc(student.db, 'users', student.uid))).data();
  assert.equal(profile.role, 'praktikan');
  await assert.rejects(getDocFromServer(doc(student.db, 'users', outsider.uid)), denied);
  await assert.rejects(
    setDoc(doc(student.db, 'users', student.uid), { role: 'asisten' }, { merge: true }),
    denied,
  );
  await assert.rejects(student.mutate('provisionAssistant', { uid: student.uid }), denied);
});

test('assistant CRUD and enrollment enable only the correct class listener', async () => {
  const requestId = randomUUID();
  const input = { name: 'Pemrograman Mobile', requestId };
  ({ id: practicumId } = await assistant.mutate('createPracticum', input));
  assert.equal((await assistant.mutate('createPracticum', input)).id, practicumId);
  ({ id: classId } = await assistant.mutate('createClass', {
    practicumId,
    name: 'TI-2A',
    timeZone: 'Asia/Jakarta',
    requestId: randomUUID(),
  }));
  await assistant.mutate('addStudent', { classId, nim: '260001' });
  const base = {
    classId,
    moduleTitle: 'Praktikum 1',
    room: 'Lab A',
    startsAt: Date.now(),
    endsAt: Date.now() + 3_600_000,
  };
  ({ id: sessionId } = await assistant.mutate('createSession', {
    ...base,
    requestId: randomUUID(),
  }));
  ({ id: permitSessionId } = await assistant.mutate('createSession', {
    ...base,
    moduleTitle: 'Praktikum 2',
    requestId: randomUUID(),
  }));
  const sessions = collection(student.db, 'classes', classId, 'sessions');
  assert.equal((await getDocsFromServer(sessions)).size, 2);
  await assert.rejects(
    getDocsFromServer(collection(outsider.db, 'classes', classId, 'sessions')),
    denied,
  );
  await assert.rejects(otherAssistant.mutate('openSession', { classId, sessionId }), denied);
  await assert.rejects(assistant.mutate('archiveClass', { classId }), conflict);
});

test('two clients see open, check-in and close; concurrent check-in creates a single record', async () => {
  const ids = { classId, sessionId };
  const studentSession = doc(student.db, 'classes', classId, 'sessions', sessionId);
  const open = observe(studentSession, (snapshot) => snapshot.data()?.status === 'open');
  await assistant.mutate('openSession', ids);
  await open;
  const recap = query(
    collection(assistant.db, 'attendances'),
    where('assistantUid', '==', assistant.uid),
    where('sessionId', '==', sessionId),
    orderBy('checkedInAt', 'desc'),
  );
  const present = observe(recap, (snapshot) => snapshot.size === 1);
  await Promise.all([student.mutate('checkIn', ids), student.mutate('checkIn', ids)]);
  const recorded = (await present).docs[0].data();
  assert.equal(recorded.studentUid, student.uid);
  assert.equal(recorded.nimSnapshot, '260001');
  assert.ok(recorded.checkedInAt.toMillis() > 0);
  assert.equal((await getDocsFromServer(recap)).size, 1);
  await assert.rejects(getDocsFromServer(collection(student.db, 'attendances')), denied);
  await assert.rejects(
    student.mutate('submitPermit', { ...ids, reason: 'Saya sedang ada keperluan.' }),
    conflict,
  );
  const closed = observe(studentSession, (snapshot) => snapshot.data()?.status === 'closed');
  await assistant.mutate('closeSession', ids);
  await closed;
  await assistant.mutate('removeStudent', { classId, studentUid: student.uid });
  await assert.rejects(getDocFromServer(studentSession), denied);
  const history = query(
    collection(student.db, 'attendances'),
    where('studentUid', '==', student.uid),
    orderBy('checkedInAt', 'desc'),
  );
  assert.equal((await getDocsFromServer(history)).size, 1);
  await student.mutate('submitReview', {
    ...ids,
    text: 'Alhamdulillah penyampaian materi sangat jelas dan mudah dipahami, terima kasih pak.',
  });
  const review = doc(student.db, 'reviews', sessionId + '~' + student.uid);
  assert.equal((await getDocFromServer(review)).data().studentUid, student.uid);
  await assert.rejects(getDocFromServer(doc(assistant.db, review.path)), denied);
  const finished = await observe(
    review,
    (snapshot) => snapshot.data()?.analysisStatus === 'succeeded',
  );
  assert.equal(finished.data().sentiment, 'positive');
  const summary = (await getDocFromServer(doc(assistant.db, 'reviewSummaries', sessionId))).data();
  assert.equal(summary.totalSubmitted, 1);
  assert.equal(summary.positiveCount, 1);
  await assistant.mutate('addStudent', { classId, nim: '260001' });
});

test('permits require a human decision, block cancellation while pending, and update student realtime', async () => {
  const ids = { classId, sessionId: permitSessionId };
  await student.mutate('submitPermit', {
    ...ids,
    reason: 'Saya sedang sakit dan perlu beristirahat.',
  });
  const permitId = permitSessionId + '~' + student.uid;
  const permit = doc(student.db, 'permits', permitId);
  assert.equal((await getDocFromServer(permit)).data().status, 'pending');
  await assert.rejects(assistant.mutate('cancelSession', ids), conflict);
  await assert.rejects(
    otherAssistant.mutate('decidePermit', { permitId, decision: 'approved' }),
    denied,
  );
  const approval = observe(permit, (snapshot) => snapshot.data()?.status === 'approved');
  await assistant.mutate('decidePermit', { permitId, decision: 'approved' });
  assert.equal((await approval).data().decidedBy, assistant.uid);
  await assistant.mutate('openSession', ids);
  await assert.rejects(student.mutate('checkIn', ids), conflict);
});

test('racing attendance and permit submission cannot record conflicting outcomes', async () => {
  await assistant.mutate('addStudent', { classId, nim: '260002' });
  const ids = { classId, sessionId: permitSessionId };
  const outcome = await Promise.allSettled([
    outsider.mutate('checkIn', ids),
    outsider.mutate('submitPermit', { ...ids, reason: 'Saya perlu menghadiri urusan keluarga.' }),
  ]);
  assert.equal(outcome.filter((item) => item.status === 'fulfilled').length, 1);
  assert.ok(conflict(outcome.find((item) => item.status === 'rejected').reason));
  if (outcome[1].status === 'fulfilled') {
    const permitId = permitSessionId + '~' + outsider.uid;
    await assert.rejects(
      assistant.mutate('decidePermit', { permitId, decision: 'rejected' }),
      (error) => error.code === 'functions/invalid-argument',
    );
    await assistant.mutate('decidePermit', {
      permitId,
      decision: 'rejected',
      decisionNote: 'Silakan hadir.',
    });
    await outsider.mutate('checkIn', ids);
  }
  await assistant.mutate('closeSession', ids);
  await assistant.mutate('archiveClass', { classId });
  await assistant.mutate('archivePracticum', { practicumId });
  await assert.rejects(
    getDocFromServer(doc(student.db, 'classes', classId, 'sessions', sessionId)),
    denied,
  );
  const retained = await getDocFromServer(
    doc(student.db, 'attendances', sessionId + '~' + student.uid),
  );
  assert.equal(retained.data().sessionSnapshot.moduleTitle, 'Praktikum 1');
});
