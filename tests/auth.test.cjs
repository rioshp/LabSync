const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Load the real TypeScript logic with fake native SDK boundaries; no Firebase accounts are created.
function loadModule(file, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const load = (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  vm.runInThisContext(`(function(require, module, exports) { ${outputText}\n})`, { filename: file })(load, module, module.exports);
  return module.exports;
}

const valid = {
  name: '  Nandra  ', nim: '  220101  ', role: 'praktikan',
  email: '  nandra@example.com  ', password: ' password ', confirmPassword: ' password ',
};

function setup({ authError, writeError, cleanupError, Timestamp = class {} } = {}) {
  const calls = [];
  const user = { uid: 'real-firebase-uid' };
  const api = loadModule('src/lib/auth.ts', {
    './firebase': { auth: 'auth-instance', db: 'db-instance' },
    '@react-native-firebase/auth': {
      createUserWithEmailAndPassword: async (...args) => {
        calls.push(['create', ...args]);
        if (authError) throw authError;
        return { user };
      },
      signInWithEmailAndPassword: async (...args) => {
        calls.push(['login', ...args]);
        if (authError) throw authError;
        return { user };
      },
      signOut: async (...args) => {
        calls.push(['logout', ...args]);
        if (authError) throw authError;
      },
      deleteUser: async (value) => {
        calls.push(['delete', value]);
        if (cleanupError) throw cleanupError;
      },
    },
    '@react-native-firebase/firestore': {
      Timestamp,
      doc: (...args) => args,
      serverTimestamp: () => 'server-timestamp',
      setDoc: async (...args) => {
        calls.push(['write', ...args]);
        if (writeError) throw writeError;
      },
    },
  });
  return { api, calls, user };
}

test('registration rejects invalid input before any SDK request', async () => {
  const invalidInputs = [
    { name: ' ' }, { name: 'a'.repeat(101) }, { nim: '' }, { nim: '1'.repeat(31) },
    { role: 'admin' }, { email: '' }, { email: 'bad-email' }, { password: '' },
    { password: '      ', confirmPassword: '      ' },
    { password: 'short', confirmPassword: 'short' }, { confirmPassword: 'different' },
  ];
  for (const invalid of invalidInputs) {
    const { api, calls } = setup();
    await assert.rejects(api.register({ ...valid, ...invalid }));
    assert.deepEqual(calls, []);
  }
});

test('student registration uses the Auth UID and stores the agreed profile without credentials', async () => {
  const { api, calls } = setup();
  await api.register(valid);
  assert.deepEqual(calls, [
    ['create', 'auth-instance', 'nandra@example.com', ' password '],
    ['write', ['db-instance', 'users', 'real-firebase-uid'], {
      name: 'Nandra', role: 'praktikan', nim: '220101', createdAt: 'server-timestamp',
    }],
  ]);
});

test('assistant registration does not require or store NIM', async () => {
  const { api, calls } = setup();
  await api.register({ ...valid, role: 'asisten', nim: '' });
  assert.equal(calls[1][2].role, 'asisten');
  assert.equal('nim' in calls[1][2], false);
});

test('duplicate email does not write or delete any profile/account', async () => {
  const authError = { code: 'auth/email-already-in-use' };
  const { api, calls } = setup({ authError });
  await assert.rejects(api.register(valid), (error) => error === authError);
  assert.equal(calls.length, 1);
  assert.match(api.getAuthErrorMessage(authError), /sudah terdaftar/);
});

test('failed profile write rolls back only the newly created account and preserves the failure', async () => {
  const writeError = { code: 'firestore/permission-denied' };
  const { api, calls, user } = setup({ writeError });
  await assert.rejects(api.register(valid), (error) => error === writeError);
  assert.deepEqual(calls[2], ['delete', user]);
  assert.match(api.getAuthErrorMessage(writeError), /Akses profil ditolak/);
});

test('failed rollback gives a clear account recovery message', async () => {
  const { api } = setup({ writeError: new Error('write failed'), cleanupError: new Error('delete failed') });
  await assert.rejects(api.register(valid), /Akun sudah dibuat.*profil gagal disimpan.*Hubungi pengelola/);
});

test('login preserves password whitespace, trims email, and propagates auth failures', async () => {
  const { api, calls, user } = setup();
  assert.deepEqual(await api.login(valid.email, valid.password), { user });
  assert.deepEqual(calls[0], ['login', 'auth-instance', 'nandra@example.com', ' password ']);
  await assert.rejects(api.login('invalid', valid.password));
  assert.equal(calls.length, 1);

  const failure = { code: 'auth/invalid-credential' };
  const denied = setup({ authError: failure });
  await assert.rejects(denied.api.login(valid.email, valid.password), (error) => error === failure);
  assert.match(denied.api.getAuthErrorMessage(failure), /Email atau password salah/);
  assert.match(api.getAuthErrorMessage({ code: 'auth/network-request-failed' }), /koneksi internet/);
});

test('profile parser rejects missing data, unsupported roles, absent student NIM, and uncommitted timestamps', () => {
  class Timestamp {}
  const { api: { parseUserProfile } } = setup({ Timestamp });
  const base = { name: 'Nandra', createdAt: new Timestamp() };
  for (const invalid of [undefined, {}, { ...base, role: 'admin' },
    { ...base, role: 'praktikan' }, { ...base, role: 'praktikan', nim: ' ' },
    { ...base, role: 'asisten', nim: '123' }, { ...base, role: 'asisten', createdAt: null }]) {
    assert.equal(parseUserProfile(invalid), null);
  }
  assert.equal(parseUserProfile({ ...base, role: 'asisten' }).role, 'asisten');
  assert.equal(parseUserProfile({ ...base, role: 'praktikan', nim: '123' }).nim, '123');
});

async function setupSession() {
  let state;
  let effect;
  let authChanged;
  let authUnsubscribed = false;
  const subscriptions = [];
  const hook = loadModule('src/hooks/useAuth.ts', {
    react: {
      createContext: () => ({ Provider: 'provider' }),
      createElement: (_type, props) => props.value,
      useContext: () => null,
      useEffect: (callback) => { effect = callback; },
      useState: (initial) => typeof initial === 'number' ? [0, () => {}] : [
        state ??= initial,
        (value) => { state = typeof value === 'function' ? value(state) : value; },
      ],
    },
    '@/lib/firebase': { auth: {}, db: {} },
    '@/lib/auth': {
      getAuthErrorMessage: (error) => error.code,
      parseUserProfile: (data) => data?.valid ? data : null,
    },
    '@react-native-firebase/auth': {
      onAuthStateChanged: (_auth, callback) => {
        authChanged = callback;
        return () => { authUnsubscribed = true; };
      },
    },
    '@react-native-firebase/firestore': {
      doc: (_db, _collection, uid) => uid,
      onSnapshot: (uid, _options, next, error) => {
        const subscription = { uid, next, error, unsubscribed: false };
        subscriptions.push(subscription);
        return () => { subscription.unsubscribed = true; };
      },
    },
  });
  hook.AuthProvider({ children: null });
  const cleanup = effect();
  await new Promise((resolve) => setImmediate(resolve));
  return {
    get state() { return state; },
    get value() { return hook.AuthProvider({ children: null }); },
    get authUnsubscribed() { return authUnsubscribed; },
    authChanged,
    subscriptions,
    cleanup,
  };
}

function snapshot(data, hasPendingWrites = false) {
  return { data: () => data, metadata: { hasPendingWrites } };
}

test('useAuth waits for a confirmed profile and clears identity on logout', async () => {
  const session = await setupSession();
  assert.equal(session.state.loading, true);
  session.authChanged({ uid: 'student' });
  const listener = session.subscriptions[0];
  assert.equal(listener.uid, 'student');
  listener.next(snapshot({ valid: true, role: 'praktikan' }, true));
  assert.equal(session.value.role, null);
  assert.equal(session.state.loading, true);
  listener.next(snapshot({ valid: true, role: 'praktikan' }));
  assert.equal(session.value.role, 'praktikan');
  assert.equal(session.state.loading, false);
  session.authChanged(null);
  assert.equal(session.value.user, null);
  assert.equal(session.value.role, null);
  assert.equal(listener.unsubscribed, true);
  session.cleanup();
  assert.equal(session.authUnsubscribed, true);
});

test('useAuth ignores late profile callbacks from a previous account or an unmounted provider', async () => {
  const session = await setupSession();
  session.authChanged({ uid: 'first' });
  const old = session.subscriptions[0];
  session.authChanged({ uid: 'second' });
  assert.equal(old.unsubscribed, true);
  old.next(snapshot({ valid: true, role: 'asisten' }));
  assert.equal(session.value.user.uid, 'second');
  assert.equal(session.value.role, null);
  const current = session.subscriptions[1];
  current.next(snapshot({ valid: true, role: 'praktikan' }));
  session.cleanup();
  assert.equal(current.unsubscribed, true);
  current.next(snapshot({ valid: true, role: 'asisten' }));
  assert.equal(session.value.role, 'praktikan');
});

test('useAuth blocks missing/failed profiles without leaving loading stuck', async () => {
  const session = await setupSession();
  session.authChanged({ uid: 'student' });
  const listener = session.subscriptions[0];
  listener.next(snapshot(undefined));
  assert.equal(session.state.loading, false);
  assert.equal(session.value.role, null);
  assert.ok(session.state.error);
  listener.error({ code: 'firestore/permission-denied' });
  assert.equal(session.state.loading, false);
  assert.equal(session.state.error, 'firestore/permission-denied');
  session.cleanup();
});

test('retry clears the last profile while a fresh read is requested', async () => {
  const session = await setupSession();
  session.authChanged({ uid: 'student' });
  session.subscriptions[0].next(snapshot({ valid: true, role: 'praktikan' }));
  session.value.retry();
  assert.equal(session.state.loading, true);
  assert.equal(session.value.role, null);
  assert.equal(session.state.profile, null);
  session.cleanup();
});
