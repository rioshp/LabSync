const assert = require('node:assert/strict');
const { test } = require('node:test');

const { loadTypeScript } = require('./load-typescript.cjs');

function setup(overrides = {}) {
  const calls = [];
  const user = { uid: 'stable-uid', emailVerified: false };
  const authInstance = { currentUser: user };
  const auth = {
    createUserWithEmailAndPassword: async (...args) => {
      calls.push(['create', ...args]);
      return { user };
    },
    sendEmailVerification: async (...args) => {
      calls.push(['verify', ...args]);
    },
    signInWithEmailAndPassword: async (...args) => {
      calls.push(['login', ...args]);
      return { user };
    },
    linkWithCredential: async (...args) => {
      calls.push(['link', ...args]);
    },
    signOut: async (...args) => {
      calls.push(['signOut', ...args]);
    },
    reload: async () => {
      user.emailVerified = true;
      calls.push(['reload']);
    },
    getIdToken: async (...args) => {
      calls.push(['token', ...args]);
    },
    ...overrides,
  };
  return {
    calls,
    user,
    authInstance,
    api: loadTypeScript('src/lib/auth.ts', {
      './firebase': { auth: authInstance },
      '@react-native-firebase/auth': auth,
      'react-native': { Platform: { OS: 'android' } },
      '../../google-services.json': { client: [] },
    }),
  };
}

test('invalid registration makes no Auth request', async () => {
  const { api, calls } = setup();
  await assert.rejects(api.register('not-an-email', 'password', 'password'));
  await assert.rejects(api.register('a@example.com', 'short', 'short'));
  await assert.rejects(api.register('a@example.com', 'password', 'different'));
  assert.deepEqual(calls, []);
});

test('registration only creates the Auth identity and sends verification', async () => {
  const { api, calls, user, authInstance } = setup();
  await api.register(' a@example.com ', ' password ', ' password ');
  assert.deepEqual(calls, [
    ['create', authInstance, 'a@example.com', ' password '],
    ['verify', user],
  ]);
});

test('verification refreshes the current token after account reload', async () => {
  const { api, user, calls } = setup();
  assert.equal(await api.refreshVerification(user), true);
  assert.equal(user.emailVerified, true);
  assert.deepEqual(calls, [['reload'], ['token', user, true]]);
});

test('Google linking preserves UID and requires successful password authentication first', async () => {
  const { api, calls, user, authInstance } = setup();
  const credential = { token: 'test-only' };
  await api.login(' a@example.com ', ' password ', credential);
  assert.deepEqual(calls, [
    ['login', authInstance, 'a@example.com', ' password '],
    ['link', user, credential],
  ]);
});

test('linking failure signs the partially authenticated user out', async () => {
  const failure = new Error('Credential expired');
  const { api, calls } = setup({
    linkWithCredential: async () => {
      throw failure;
    },
  });
  await assert.rejects(api.login('a@example.com', 'password', {}), failure);
  assert.equal(calls.at(-1)[0], 'signOut');
});

test('old profile formats and invalid roles cannot unlock academic features', () => {
  const { api } = setup();
  assert.equal(api.parseUserProfile({ name: 'B', role: 'asisten' }), null);
  assert.equal(
    api.parseUserProfile({
      displayName: 'B',
      role: 'pengelola',
      accountStatus: 'active',
      nim: null,
    }),
    null,
  );
  assert.equal(
    api.parseUserProfile({ displayName: 'B', role: 'praktikan', accountStatus: 'active' }),
    null,
  );
  assert.equal(
    api.parseUserProfile({
      displayName: 'B',
      role: 'asisten',
      accountStatus: 'disabled',
      nim: null,
    }).accountStatus,
    'disabled',
  );
});

test('adding a password sends the Google account email and ID token to Firebase', async (context) => {
  const { api, user, calls, authInstance } = setup({
    getIdToken: async () => 'test-session-token',
  });
  user.emailVerified = true;
  user.email = 'google@example.com';
  user.providerData = [{ providerId: 'google.com' }];
  authInstance.app = { options: { apiKey: 'test-public-key' } };
  const request = context.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ localId: user.uid }),
  }));

  await api.addAccountPassword('new-password', 'new-password');

  assert.equal(request.mock.callCount(), 1);
  const [url, options] = request.mock.calls[0].arguments;
  assert.equal(
    url,
    'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-public-key',
  );
  assert.deepEqual(JSON.parse(options.body), {
    idToken: 'test-session-token',
    email: 'google@example.com',
    password: 'new-password',
    returnSecureToken: true,
  });
  assert.deepEqual(calls, [['reload']]);
});

test('password reset does not expose whether an address has a Firebase user', async () => {
  const { api } = setup({
    sendPasswordResetEmail: async () => {
      throw { code: 'auth/user-not-found' };
    },
  });
  await assert.doesNotReject(api.resetPassword('a@example.com'));
});
