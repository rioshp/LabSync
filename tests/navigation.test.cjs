const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { getRoutes } = require('expo-router/build/getRoutes');
const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig');
const { getStateFromPath } = require('expo-router/build/fork/getStateFromPath');
const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter');

function loadScreen(file, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) { ${outputText}\n})`)(
    (name) => name === 'react/jsx-runtime' ? require(name) : dependencies[name], module, module.exports,
  );
  return module.exports.default;
}

function declaredScreens(session) {
  const Stack = Object.assign(() => null, { Screen: 'screen', Protected: 'protected' });
  const RootLayout = loadScreen('_layout.tsx', {
    'expo-router': { Stack },
    '@/hooks/useAuth': { AuthProvider: 'provider', useAuth: () => session },
  });
  const navigator = RootLayout().props.children.type();
  return collectScreens(navigator.props.children, Stack.Screen).map((screen) => screen.props.name);
}

function collectScreens(children, screenType) {
  return [].concat(children).flatMap((child) => {
    if (child.type === screenType) return [child];
    return child.props.guard ? collectScreens(child.props.children, screenType) : [];
  });
}

function renderTabs(role) {
  const Tabs = Object.assign(() => null, { Screen: 'tab-screen', Protected: 'protected' });
  const Layout = loadScreen('(app)/_layout.tsx', {
    'expo-router': { Tabs },
    'react-native': { Text: 'text' },
    '@/hooks/useAuth': { useAuth: () => ({ role }) },
    '@/components/logout-button': { LogoutButton: 'logout-button' },
    '@/constants/theme': { BrandColors: {} },
  });
  const layout = Layout();
  return { layout, screens: collectScreens(layout.props.children, Tabs.Screen) };
}

test('root always retains its entry route while protecting registration and private screens', () => {
  for (const session of [
    { user: null, profile: null, loading: true },
    { user: null, profile: null, loading: false },
    { user: { uid: 'student' }, profile: null, loading: false },
    { user: { uid: 'student' }, profile: { role: 'praktikan' }, loading: true },
  ]) {
    assert.deepEqual(declaredScreens(session), ['index', 'register']);
  }
  const screens = declaredScreens({ user: { uid: 'student' }, profile: { role: 'praktikan' }, loading: false });
  assert.ok(screens.includes('(app)'));
  assert.ok(screens.includes('index'));
  assert.ok(!screens.includes('register'));
});

test('entry redirects to the schedule only when account and profile are ready', () => {
  function render(session) {
    const Login = loadScreen('index.tsx', {
      'expo-router': { Link: 'link', Redirect: 'redirect' },
      react: { useState: (value) => [value, () => {}] },
      'react-native': { View: 'view' },
      '@/hooks/useAuth': { useAuth: () => session },
      '@/lib/auth': {},
      '@/components/auth-session-status': { AuthSessionStatus: 'auth-status' },
      '@/components/auth-screen': {
        AuthScreen: 'auth-screen', AuthField: 'auth-field', AuthButton: 'auth-button',
        AuthError: 'auth-error', authStyles: {},
      },
    });
    return Login();
  }

  const ready = render({ user: { uid: 'student' }, profile: { role: 'praktikan' }, loading: false });
  assert.equal(ready.type, 'redirect');
  assert.equal(ready.props.href, '/jadwal');
  for (const session of [
    { user: null, profile: null, loading: false },
    { user: { uid: 'student' }, profile: null, loading: false },
    { user: { uid: 'student' }, profile: { role: 'praktikan' }, loading: true },
  ]) {
    assert.notEqual(render(session).type, 'redirect');
  }
});

test('root URL never becomes the generated not-found route after login', () => {
  const files = fs.readdirSync(path.join(__dirname, '../src/app'), { recursive: true })
    .filter((file) => file.endsWith('.tsx')).map((file) => `./${file}`);
  const context = () => ({ default: () => null });
  context.keys = () => files;
  const config = getReactNavigationConfig(getRoutes(context, {
    platform: 'android', importMode: 'lazy', ignoreEntryPoints: true,
  }), true);
  assert.ok('+not-found' in config.screens);

  const declared = new Set(declaredScreens({
    user: { uid: 'student' }, profile: { role: 'praktikan' }, loading: false,
  }));
  const activeConfig = {
    ...config,
    screens: Object.fromEntries(Object.entries(config.screens).filter(([name]) =>
      declared.has(name) || name === '_sitemap' || name === '+not-found')),
  };
  assert.equal(getStateFromPath('/', activeConfig).routes[0].name, 'index');
  const home = getStateFromPath('/home', activeConfig).routes[0];
  assert.equal(home.name, '(app)');
  assert.equal(home.state.routes[0].name, 'home');
  const schedule = getStateFromPath('/jadwal', activeConfig).routes[0];
  assert.equal(schedule.name, '(app)');
  assert.equal(schedule.state.routes[0].name, 'jadwal');
});

test('tabs expose exactly the two planned destinations per role and logout in the header', () => {
  for (const [role, expected] of [
    ['asisten', ['jadwal', 'asisten/izin']],
    ['praktikan', ['jadwal', 'praktikan/riwayat']],
  ]) {
    const { layout, screens } = renderTabs(role);
    assert.deepEqual(screens.filter((screen) => screen.props.options.href !== null)
      .map((screen) => screen.props.name), expected);
    assert.equal(layout.props.screenOptions.headerRight().type, 'logout-button');
    assert.equal(screens.some((screen) => screen.props.name.startsWith(role === 'asisten' ? 'praktikan/' : 'asisten/')), false);
  }
});

test('planned detail routes resolve and each role can access only its own entry points', () => {
  const files = fs.readdirSync(path.join(__dirname, '../src/app'), { recursive: true })
    .filter((file) => file.endsWith('.tsx')).map((file) => `./${file}`);
  const context = () => ({ default: () => null });
  context.keys = () => files;
  const config = getReactNavigationConfig(getRoutes(context, {
    platform: 'android', importMode: 'lazy', ignoreEntryPoints: true,
  }), true);

  for (const role of ['asisten', 'praktikan']) {
    const allowed = new Set(renderTabs(role).screens.map((screen) => screen.props.name));
    const scoped = {
      ...config, screens: { ...config.screens, '(app)': {
        ...config.screens['(app)'],
        screens: Object.fromEntries(Object.entries(config.screens['(app)'].screens)
          .filter(([name]) => allowed.has(name))),
      } },
    };
    const destination = role === 'asisten' ? '/asisten/sesi' : '/praktikan/presensi';
    const matched = getStateFromPath(`${destination}?sessionId=session-a`, scoped).routes[0];
    assert.equal(matched.name, '(app)');
    assert.equal(matched.state.routes[0].name, destination.slice(1));
    assert.equal(matched.state.routes[0].params.sessionId, 'session-a');
    const forbidden = getStateFromPath(role === 'asisten' ? '/praktikan/presensi' : '/asisten/sesi', scoped);
    assert.notEqual(forbidden?.routes[0].name, '(app)');
  }
});

function renderSchedule(role, schedule) {
  const calls = [];
  const retry = () => calls.push('retry');
  const Screen = loadScreen('(app)/jadwal.tsx', {
    'expo-router': { router: { push: (value) => calls.push(value) } },
    'react-native': {
      View: 'view', Text: 'text', ScrollView: 'scroll', Pressable: 'pressable',
      ActivityIndicator: 'spinner', StyleSheet: { create: (value) => value, absoluteFill: {} },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/components/auth-screen': { AuthButton: 'auth-button' },
    '@/hooks/useAuth': { useAuth: () => ({ role, profile: { role, name: 'Pengguna Firebase', nim: '123' } }) },
    '@/hooks/useSchedule': { useSchedule: () => ({ sessions: [], loading: false, error: null, retry, ...schedule }) },
    '@/constants/theme': {
      BrandColors: {}, SessionStatusColors: {
        BELUM_DIBUKA: { label: 'Belum Dibuka' }, DIBUKA: { label: 'Sedang Dibuka' }, DITUTUP: { label: 'Sesi Ditutup' },
      },
    },
  });
  return { tree: Screen(), calls };
}

function elements(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}

function textContent(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  if (Array.isArray(tree)) return tree.map(textContent).join(' ');
  return textContent(tree.props?.children);
}

const sessionFixture = {
  id: 'cloud-session', className: 'IF-3A', practicum: 'Basis Data', module: 'Modul 1',
  date: '2026-11-15', startTime: '08:00', endTime: '10:00', room: 'Lab 1', status: 'open',
};

test('session cards navigate with the Firestore session ID and the authenticated role', () => {
  for (const [role, pathname] of [
    ['asisten', '/(app)/asisten/sesi'], ['praktikan', '/(app)/praktikan/presensi'],
  ]) {
    const rendered = renderSchedule(role, { sessions: [sessionFixture] });
    const card = elements(rendered.tree).find((element) => element.type === 'pressable');
    card.props.onPress();
    assert.deepEqual(rendered.calls, [{ pathname, params: { sessionId: 'cloud-session' } }]);
    assert.match(textContent(rendered.tree), /Pengguna Firebase/);
  }
});

test('schedule renders loading, empty, and retryable errors without a session card', () => {
  for (const [state, expected] of [
    [{ loading: true }, /Memuat jadwal/],
    [{ sessions: [] }, /Belum ada jadwal/],
    [{ error: 'Koneksi gagal' }, /Koneksi gagal/],
  ]) {
    const rendered = renderSchedule('praktikan', state);
    assert.match(textContent(rendered.tree), expected);
    assert.equal(elements(rendered.tree).some((element) => element.type === 'pressable'), false);
    if (state.error) {
      elements(rendered.tree).find((element) => element.props?.title === 'Coba lagi').props.onPress();
      assert.deepEqual(rendered.calls, ['retry']);
    }
  }
});

test('schedule badges map all Sprint 2 statuses to the existing theme labels', () => {
  const rendered = renderSchedule('asisten', {
    sessions: ['upcoming', 'open', 'closed'].map((status) => ({ ...sessionFixture, id: status, status })),
  });
  const text = textContent(rendered.tree);
  for (const label of ['Belum Dibuka', 'Sedang Dibuka', 'Sesi Ditutup']) assert.ok(text.includes(label));
});

test('real Expo linking resolves login and home to different routes', () => {
  const files = fs.readdirSync(path.join(__dirname, '../src/app'), { recursive: true })
    .filter((file) => file.endsWith('.tsx')).map((file) => `./${file}`);
  const context = () => ({ default: () => null });
  context.keys = () => files;
  const config = getReactNavigationConfig(getRoutes(context, {
    platform: 'android', importMode: 'lazy', skipGenerated: true, ignoreEntryPoints: true,
  }), true);

  assert.equal(getStateFromPath('/', config).routes[0].name, 'index');
  const home = getStateFromPath('/home', config).routes[0];
  assert.equal(home.name, '(app)');
  assert.equal(home.state.routes[0].name, 'home');
  assert.equal('index' in config.screens['(app)'].screens, false);
});

test('real Expo stack router settles on login after login/logout and repeated auth notifications', () => {
  const router = StackRouter({});
  const loggedOut = declaredScreens({ user: null, profile: null, loading: false });
  const loggedIn = declaredScreens({ user: { uid: 'student' }, profile: { role: 'praktikan' }, loading: false });
  const options = { routeParamList: {}, routeGetIdList: {} };

  for (const entry of ['index', 'register']) {
    let state = {
      stale: false, type: 'stack', key: 'root', index: 0,
      routeNames: loggedOut, routes: [{ key: `${entry}-key`, name: entry }],
    };
    function changeRoutes(routeNames) {
      state = router.getStateForAction(state, {
        type: 'ROUTE_NAMES_CHANGED', payload: { routeNames },
      }, options).state;
    }

    changeRoutes(loggedIn);
    assert.equal(state.routes[state.index].name, 'index');
    // The stable entry screen redirects only after both account and profile are ready.
    state = router.getStateForAction(state, {
      type: 'REPLACE', payload: { name: '(app)' },
    }, options).state;
    assert.equal(state.routes[state.index].name, '(app)');
    changeRoutes(loggedOut);
    assert.equal(state.routes[state.index].name, 'index');
    assert.equal(state.routes.some((route) => route.name === '(app)'), false);
    const settled = state;
    changeRoutes(loggedOut);
    assert.equal(state, settled);
  }
});
