const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { getRoutes } = require('expo-router/build/getRoutes');
const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig');
const { getStateFromPath } = require('expo-router/build/fork/getStateFromPath');
const { loadTypeScript } = require('./load-typescript.cjs');

function collectScreens(children, screenType) {
  return []
    .concat(children)
    .filter(Boolean)
    .flatMap((child) => {
      if (child.type === screenType) return [child];
      return child.props.guard ? collectScreens(child.props.children, screenType) : [];
    });
}

function rootScreens(session) {
  const Stack = { Screen: 'screen', Protected: 'protected' };
  const Root = loadTypeScript('src/app/_layout.tsx', {
    'expo-router': { Stack },
    '@/hooks/useAuth': { AuthProvider: 'provider', useAuth: () => session },
  }).default;
  return collectScreens(Root().props.children.type().props.children, Stack.Screen).map(
    (screen) => screen.props.name,
  );
}

function tabs(role) {
  const Tabs = { Screen: 'tab', Protected: 'protected' };
  const Layout = loadTypeScript('src/app/(app)/_layout.tsx', {
    'expo-router': { Tabs },
    'react-native': { Text: 'text' },
    '@/hooks/useAuth': { useAuth: () => ({ role }) },
    '@/components/logout-button': { LogoutButton: 'logout-button' },
    '@/constants/theme': { BrandColors: {} },
  }).default;
  return collectScreens(Layout().props.children, Tabs.Screen);
}

test('only an active Auth and Firestore profile opens the application group', () => {
  assert.deepEqual(rootScreens({ user: null, phase: 'signed-out' }), ['index', 'register']);
  for (const phase of ['loading', 'verify', 'onboarding', 'disabled', 'error']) {
    assert.deepEqual(rootScreens({ user: { uid: 'student' }, phase }), ['index']);
  }
  assert.deepEqual(rootScreens({ user: { uid: 'student' }, phase: 'active' }), ['index', '(app)']);
});

test('student-only routes cannot enter assistant tabs and are hidden from tab bar', () => {
  const assistant = tabs('asisten');
  const student = tabs('praktikan');
  const visible = (screens) =>
    screens
      .filter((screen) => screen.props.options.href !== null)
      .map((screen) => screen.props.name);
  assert.deepEqual(visible(assistant), ['jadwal', 'asisten/praktikum', 'asisten/izin']);
  assert.deepEqual(visible(student), ['jadwal', 'praktikan/riwayat']);
  assert.ok(!assistant.some((item) => item.props.name.startsWith('praktikan/')));
  assert.ok(!student.some((item) => item.props.name.startsWith('asisten/')));
  assert.ok(student.some((item) => item.props.name === 'praktikan/ulasan'));
});

test('Expo Router resolves actual screen files without obsolete demo routes', () => {
  const dir = path.join(__dirname, '../src/app');
  const files = fs
    .readdirSync(dir, { recursive: true })
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => './' + file);
  const context = () => ({ default: () => null });
  context.keys = () => files;
  const config = getReactNavigationConfig(
    getRoutes(context, { platform: 'android', importMode: 'lazy' }),
    true,
  );
  function leaf(url) {
    let state = getStateFromPath(url, config);
    while (state?.routes.at(-1)?.state) state = state.routes.at(-1).state;
    return state?.routes.at(-1)?.name;
  }
  assert.equal(leaf('/'), 'index');
  assert.notEqual(leaf('/demo'), 'demo');
  assert.equal(leaf('/praktikan/presensi?classId=kelas1&sessionId=sesi1'), 'praktikan/presensi');
  assert.equal(leaf('/asisten/izin'), 'asisten/izin');
  assert.notEqual(leaf('/asisten-sesi'), 'asisten-sesi');
});
