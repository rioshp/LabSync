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
  return navigator.props.children.flatMap((child) => {
    if (child.type === Stack.Screen) return [child.props.name];
    return child.props.guard
      ? [].concat(child.props.children).map((screen) => screen.props.name)
      : [];
  });
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

test('entry redirects to the real home URL only when account and profile are ready', () => {
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
  assert.equal(ready.props.href, '/home');
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
