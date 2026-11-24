const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, test } = require('node:test');
const { createRequire } = require('node:module');
const backendRequire = createRequire(require.resolve('../functions/package.json'));
const { initializeApp: initializeAdmin, deleteApp: deleteAdmin } =
  backendRequire('firebase-admin/app');
const { getAuth: getAdminAuth } = backendRequire('firebase-admin/auth');
const { getFirestore: getAdminFirestore, FieldValue } = backendRequire('firebase-admin/firestore');
const { loadTypeScript } = require('./load-typescript.cjs');
const firebaseAuth = require('firebase/auth');
const firestore = require('firebase/firestore');
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} = require('firebase/firestore');

const projectId = process.env.GCLOUD_PROJECT || 'demo-labsync';
const clients = [];
const runId = randomUUID().slice(0, 8);
const password = 'Test-labsync-2026!';
let admin;
let assistant;
let otherAssistant;
let student;
let outsider;
let classId;
let sessionId;
let permitSessionId;
let labId;

function endpoint(name, fallback) {
  const [host, port] = (process.env[name] || fallback).split(':');
  return [host, Number(port)];
}

async function client(label) {
  const email = label + '-' + runId + '@example.test';
  const account = await getAdminAuth(admin).createUser({
    email,
    password,
    emailVerified: true,
    displayName: label,
  });
  const app = initializeApp({ projectId, apiKey: 'demo-only-key', appId: 'demo-' + label }, label);
  clients.push(app);
  const auth = getAuth(app);
  const [authHost, authPort] = endpoint('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
  connectAuthEmulator(auth, 'http://' + authHost + ':' + authPort, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, ...endpoint('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080'));
  await signInWithEmailAndPassword(auth, email, password);
  const dependencies = {
    './firebase': { auth, db },
    '@react-native-firebase/auth': firebaseAuth,
    '@react-native-firebase/firestore': firestore,
    'react-native': { Platform: { OS: 'web' } },
    '../../google-services.json': { client: [] },
    '../../functions/ai/sentiment': require('../functions/ai/sentiment.js'),
    '../../functions/ai/model-edom.json': require('../functions/ai/model-edom.json'),
  };
  dependencies['./firebase-error'] = loadTypeScript('src/lib/firebase-error.ts');
  dependencies['./auth'] = loadTypeScript('src/lib/auth.ts', dependencies);
  dependencies['./firestore-input'] = loadTypeScript('src/lib/firestore-input.ts', dependencies);
  dependencies['./location'] = loadTypeScript('src/lib/location.ts');
  for (const module of ['labs', 'classes', 'sessions', 'roster', 'participation', 'reviews']) {
    dependencies['./' + module] = loadTypeScript('src/lib/' + module + '.ts', dependencies);
  }
  dependencies['./notification-triggers'] = {
    notifySessionOpened: async () => {},
    notifySessionUpdated: async () => {},
    notifyPermitDecided: async () => {},
    sendExpoPushNotifications: async () => {},
  };
  const { mutate } = loadTypeScript('src/lib/mutations.ts', {
    ...dependencies,
    'expo-crypto': { randomUUID },
  });
  const { completeProfile, updateAccountProfile } = loadTypeScript(
    'src/lib/profile.ts',
    dependencies,
  );
  return {
    uid: account.uid,
    db,
    mutate: (action, fields) =>
      mutate(
        action,
        action === 'checkIn'
          ? {
              location: { latitude: -7, longitude: 110, accuracy: 5, capturedAt: Date.now() },
              ...fields,
            }
          : fields,
      ),
    completeProfile,
    updateAccountProfile,
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

const denied = (error) => error.code === 'permission-denied';
const conflict = (error) =>
  denied(error) || /Selesaikan|Putuskan|Kehadiran|Izin|sesi/i.test(error.message);

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
    [assistant, otherAssistant, student, outsider] = await Promise.all([
      client('assistant'),
      client('other-assistant'),
      client('student'),
      client('outsider'),
    ]);
    for (const account of [assistant, otherAssistant]) {
      const timestamp = FieldValue.serverTimestamp();
      await getAdminFirestore(admin)
        .doc('users/' + account.uid)
        .set({
          displayName: 'Asisten Uji',
          role: 'asisten',
          accountStatus: 'active',
          nim: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
    }
    await student.completeProfile('Praktikan A', '260001');
    await outsider.completeProfile('Praktikan B', '260002');
  },
  { timeout: 60_000 },
);

after(async () => {
  await Promise.all(clients.map(deleteApp));
  if (admin) await deleteAdmin(admin);
});

test('Firestore enforces UID, role and authenticated onboarding', async () => {
  const profile = (await getDocFromServer(doc(student.db, 'users', student.uid))).data();
  assert.equal(profile.role, 'praktikan');
  await assert.rejects(getDocFromServer(doc(student.db, 'users', outsider.uid)), denied);
  await assert.rejects(
    setDoc(doc(student.db, 'users', student.uid), { role: 'asisten' }, { merge: true }),
    denied,
  );
  assert.equal(
    (await getDocFromServer(doc(student.db, 'users', student.uid))).data().nim,
    '260001',
  );
  const duplicate = await client('duplicate');
  await assert.rejects(duplicate.completeProfile('Duplikat', '260001'), /NIM belum dipakai/);
  assert.equal((await getDocFromServer(doc(duplicate.db, 'users', duplicate.uid))).exists(), false);
});

test('profile edits move the NIM claim atomically and preserve the last valid profile', async () => {
  const ref = doc(student.db, 'users', student.uid);
  await assert.rejects(student.updateAccountProfile('Duplikat', '260002'), /NIM belum dipakai/);
  assert.equal((await getDocFromServer(ref)).data().nim, '260001');
  await student.updateAccountProfile('Praktikan A Baru', '260003');
  assert.equal((await getDocFromServer(ref)).data().nim, '260003');
  assert.equal((await getDocFromServer(ref)).data().displayName, 'Praktikan A Baru');
  await student.updateAccountProfile('Praktikan A', '260001');
});

test('assistant CRUD and enrollment enable only the correct class listener', async () => {
  const requestId = randomUUID();
  const input = { name: 'TI-2A', timeZone: 'Asia/Jakarta', requestId };
  ({ id: classId } = await assistant.mutate('createClass', input));
  assert.equal((await assistant.mutate('createClass', input)).id, classId);
  assert.equal(
    (await getDocFromServer(doc(assistant.db, 'classes', classId))).data().practicumId,
    null,
  );
  const candidate = await assistant.mutate('lookupStudent', { classId, nim: '260001' });
  assert.equal(candidate.studentUid, student.uid);
  assert.deepEqual(
    await assistant.mutate('lookupStudentsByName', { classId, name: 'Praktikan A' }),
    [candidate],
  );
  await assert.rejects(
    otherAssistant.mutate('lookupStudentsByName', { classId, name: 'Praktikan A' }),
    denied,
  );
  await assert.rejects(
    getDocsFromServer(query(collection(assistant.db, 'users'), limit(10))),
    denied,
  );
  await assistant.mutate('addStudent', {
    classId,
    nim: candidate.nim,
    studentUid: candidate.studentUid,
    displayName: candidate.displayName,
  });
  const base = {
    classId,
    moduleTitle: 'Praktikum 1',
    room: 'Lab A',
    startsAt: Date.now(),
    endsAt: Date.now() + 3_600_000,
  };
  ({ id: labId } = await assistant.mutate('createLab', {
    requestId: randomUUID(),
    name: 'Lab Uji',
    description: 'Gedung A',
    latitude: -7,
    longitude: 110,
    radiusMeters: 50,
  }));
  ({ id: sessionId } = await assistant.mutate('createSession', {
    ...base,
    labId,
    requestId: randomUUID(),
  }));
  ({ id: permitSessionId } = await assistant.mutate('createSession', {
    ...base,
    labId,
    moduleTitle: 'Praktikum 2',
    requestId: randomUUID(),
  }));
  const sessions = collection(student.db, 'classes', classId, 'sessions');
  assert.equal((await getDocsFromServer(sessions)).size, 2);
  assert.ok((await getDocFromServer(doc(student.db, 'classes', classId))).exists());
  assert.ok(
    (await getDocFromServer(doc(student.db, 'classes', classId, 'sessions', sessionId))).exists(),
  );
  const recordId = sessionId + '~' + student.uid;
  for (const collectionName of ['attendances', 'permits', 'reviews']) {
    const own = await getDocFromServer(doc(student.db, collectionName, recordId));
    assert.equal(own.exists(), false);
    await assert.rejects(getDocFromServer(doc(outsider.db, collectionName, recordId)), denied);
  }
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
  await assert.rejects(
    getDocsFromServer(collection(student.db, 'classes', classId, 'sessions')),
    denied,
  );
  assert.equal((await getDocFromServer(studentSession)).data().status, 'closed');
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
  await assistant.mutate('addStudent', {
    classId,
    nim: '260001',
    studentUid: student.uid,
    displayName: 'Praktikan A',
  });
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
  await assistant.mutate('addStudent', {
    classId,
    nim: '260002',
    studentUid: outsider.uid,
    displayName: 'Praktikan B',
  });
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
      /Penolakan memerlukan catatan/,
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
  await assert.rejects(
    getDocsFromServer(collection(student.db, 'classes', classId, 'sessions')),
    denied,
  );
  const retained = await getDocFromServer(
    doc(student.db, 'attendances', sessionId + '~' + student.uid),
  );
  assert.equal(retained.data().sessionSnapshot.moduleTitle, 'Praktikum 1');
});

async function locationFixture() {
  const { id: testLabId } = await assistant.mutate('createLab', {
    requestId: randomUUID(),
    name: 'Lab Lokasi',
    description: '',
    latitude: -7,
    longitude: 110,
    radiusMeters: 50,
  });
  const { id: testClassId } = await assistant.mutate('createClass', {
    requestId: randomUUID(),
    name: 'Kelas Lokasi',
    timeZone: 'Asia/Jakarta',
  });
  await assistant.mutate('addStudent', {
    classId: testClassId,
    studentUid: student.uid,
    nim: '260001',
    displayName: 'Praktikan A',
  });
  const { id: testSessionId } = await assistant.mutate('createSession', {
    requestId: randomUUID(),
    classId: testClassId,
    labId: testLabId,
    moduleTitle: 'Lokasi',
    room: 'Lab Lokasi',
    startsAt: Date.now() + 60_000,
    endsAt: Date.now() + 3_600_000,
  });
  return { classId: testClassId, sessionId: testSessionId, labId: testLabId };
}

test('lab CRUD is role-scoped and projections publish every session transition atomically', async () => {
  const ids = await locationFixture();
  const lab = doc(assistant.db, 'labs', ids.labId);
  const originalLab = (await getDocFromServer(lab)).data();
  await assert.rejects(
    setDoc(doc(student.db, 'labs', ids.labId), { ...originalLab, name: 'Tấn công' }),
    denied,
  );
  await assert.rejects(
    otherAssistant.mutate('updateLab', { ...originalLab, labId: ids.labId, name: 'Khác' }),
    /asisten lain/,
  );
  await assistant.mutate('updateLab', { ...originalLab, labId: ids.labId, description: 'Tầng 2' });
  assert.equal((await getDocFromServer(lab)).data().description, 'Tầng 2');
  const projection = doc(outsider.db, 'labSchedules', ids.sessionId);
  const source = doc(assistant.db, 'classes', ids.classId, 'sessions', ids.sessionId);
  const initial = (await getDocFromServer(source)).data();
  assert.equal((await getDocFromServer(projection)).data().status, 'scheduled');
  await assert.rejects(getDocFromServer(doc(outsider.db, source.path)), denied);
  await assert.rejects(
    setDoc(source, {
      ...initial,
      moduleTitle: 'Thay đổi thiếu proyeksi',
      updatedAt: firestore.serverTimestamp(),
    }),
    denied,
  );
  const projected = (await getDocFromServer(projection)).data();
  await assert.rejects(
    setDoc(doc(assistant.db, projection.path), {
      ...projected,
      moduleTitle: 'Giả',
      updatedAt: firestore.serverTimestamp(),
    }),
    denied,
  );
  const newStart = initial.startsAt.toMillis() + 60_000;
  await assistant.mutate('updateSession', {
    ...ids,
    moduleTitle: 'Lokasi Diperbarui',
    room: initial.room,
    startsAt: newStart,
    endsAt: initial.endsAt.toMillis(),
    radiusMeters: 60,
  });
  assert.equal((await getDocFromServer(projection)).data().moduleTitle, 'Lokasi Diperbarui');
  assert.equal((await getDocFromServer(source)).data().radiusMeters, undefined);
  await assistant.mutate('openSession', ids);
  assert.equal((await getDocFromServer(projection)).data().status, 'open');
  await assistant.mutate('openSession', ids);
  await assistant.mutate('closeSession', ids);
  assert.equal((await getDocFromServer(projection)).data().status, 'closed');
  assert.equal(
    (await getDocFromServer(doc(assistant.db, 'classes', ids.classId))).data()
      .unfinishedSessionCount,
    0,
  );
  await assistant.mutate('archiveLab', { labId: ids.labId });
  assert.equal((await getDocFromServer(lab)).data().status, 'archived');
  const cancellation = await locationFixture();
  await assistant.mutate('cancelSession', cancellation);
  assert.equal(
    (await getDocFromServer(doc(outsider.db, 'labSchedules', cancellation.sessionId))).data()
      .status,
    'cancelled',
  );
});

test('check-in rejects outside, stale and inaccurate samples and rules recompute distance', async () => {
  const ids = await locationFixture();
  await assistant.mutate('openSession', ids);
  await assert.rejects(
    student.mutate('checkIn', {
      ...ids,
      location: { latitude: -7.01, longitude: 110, accuracy: 5, capturedAt: Date.now() },
    }),
    /luar area/,
  );
  await assert.rejects(
    student.mutate('checkIn', {
      ...ids,
      location: { latitude: -7, longitude: 110, accuracy: 50, capturedAt: Date.now() },
    }),
    /akurat/,
  );
  await assert.rejects(
    student.mutate('checkIn', {
      ...ids,
      location: { latitude: -7, longitude: 110, accuracy: 5, capturedAt: Date.now() - 60_000 },
    }),
    /kedaluwarsa/,
  );
  const attendanceId = ids.sessionId + '~' + student.uid;
  const source = (
    await getDocFromServer(doc(student.db, 'classes', ids.classId, 'sessions', ids.sessionId))
  ).data();
  const raw = {
    classId: ids.classId,
    sessionId: ids.sessionId,
    assistantUid: assistant.uid,
    studentUid: student.uid,
    studentNameSnapshot: 'Praktikan A',
    nimSnapshot: '260001',
    sessionSnapshot: {
      practicumName: 'Kelas Lokasi',
      className: 'Kelas Lokasi',
      moduleTitle: source.moduleTitle,
      startsAt: source.startsAt,
      timeZone: 'Asia/Jakarta',
    },
    labId: ids.labId,
    radiusMeters: 50,
    distanceMeters: 0,
    checkedInAt: firestore.serverTimestamp(),
    checkInLocation: {
      latitude: -7.01,
      longitude: 110,
      accuracy: 5,
      capturedAt: firestore.Timestamp.now(),
    },
  };
  await assert.rejects(setDoc(doc(student.db, 'attendances', attendanceId), raw), denied);
  await assert.rejects(
    setDoc(doc(student.db, 'attendances', attendanceId), { ...raw, radiusMeters: 10000 }),
    denied,
  );
  await Promise.all([student.mutate('checkIn', ids), student.mutate('checkIn', ids)]);
  const attendance = (await getDocFromServer(doc(student.db, 'attendances', attendanceId))).data();
  assert.equal(attendance.labId, ids.labId);
  assert.equal(attendance.distanceMeters, 0);
  assert.equal(attendance.radiusMeters, 50);
  await assistant.mutate('closeSession', ids);
  // A retry of an already committed attendance preserves the original record after closure.
  assert.equal((await student.mutate('checkIn', ids)).id, attendanceId);
  await assert.rejects(
    setDoc(doc(student.db, 'attendances', attendanceId), { ...attendance, distanceMeters: 1 }),
    denied,
  );
});

test('lab selection and location are mandatory without breaking permits', async () => {
  const ids = await locationFixture();
  await assistant.mutate('archiveLab', { labId: ids.labId });
  await assert.rejects(assistant.mutate('openSession', ids), /tidak aktif/);
  const active = await locationFixture();
  await assistant.mutate('openSession', active);
  const pending = await student.mutate('submitPermit', {
    ...active,
    reason: 'Saya tidak dapat hadir karena sakit.',
  });
  await assert.rejects(student.mutate('checkIn', active), /menghalangi/);
  await assistant.mutate('decidePermit', {
    permitId: pending.id,
    decision: 'rejected',
    decisionNote: 'Silakan hadir.',
  });
  await student.mutate('checkIn', active);
  assert.equal(
    (
      await getDocFromServer(doc(student.db, 'attendances', active.sessionId + '~' + student.uid))
    ).exists(),
    true,
  );
});

test('attendance uses the current lab radius and ignores legacy session or client overrides', async () => {
  const ids = await locationFixture();
  const sessionPath = `classes/${ids.classId}/sessions/${ids.sessionId}`;
  // Existing sessions may retain an obsolete custom radius; it must have no authority.
  await getAdminFirestore(admin).doc(sessionPath).update({ radiusMeters: 100 });
  await assistant.mutate('openSession', ids);
  const labRef = doc(assistant.db, 'labs', ids.labId);
  const original = (await getDocFromServer(labRef)).data();
  await assistant.mutate('updateLab', { ...original, labId: ids.labId, radiusMeters: 10 });
  await assert.rejects(student.mutate('checkIn', {
    ...ids,
    radiusMeters: 100,
    location: { latitude: -7.0002, longitude: 110, accuracy: 5, capturedAt: Date.now() },
  }), /luar area/);
  const source = (await getDocFromServer(doc(student.db, sessionPath))).data();
  const attendanceRef = doc(student.db, 'attendances', ids.sessionId + '~' + student.uid);
  // Direct writes must also reject the old radius, even at the center of the lab.
  await assert.rejects(setDoc(attendanceRef, {
    classId: ids.classId,
    sessionId: ids.sessionId,
    assistantUid: assistant.uid,
    studentUid: student.uid,
    studentNameSnapshot: 'Praktikan A',
    nimSnapshot: '260001',
    sessionSnapshot: {
      practicumName: 'Kelas Lokasi', className: 'Kelas Lokasi',
      moduleTitle: source.moduleTitle, startsAt: source.startsAt, timeZone: 'Asia/Jakarta',
    },
    labId: ids.labId, radiusMeters: 100, distanceMeters: 0,
    checkedInAt: firestore.serverTimestamp(),
    checkInLocation: {
      latitude: -7, longitude: 110, accuracy: 5, capturedAt: firestore.Timestamp.now(),
    },
  }), denied);
  await student.mutate('checkIn', { ...ids, radiusMeters: 100 });
  assert.equal((await getDocFromServer(attendanceRef)).data().radiusMeters, 10);
  // A later lab change must not rewrite the radius recorded on an earlier attendance.
  await assistant.mutate('updateLab', { ...original, labId: ids.labId, radiusMeters: 30 });
  assert.equal((await getDocFromServer(attendanceRef)).data().radiusMeters, 10);
});
