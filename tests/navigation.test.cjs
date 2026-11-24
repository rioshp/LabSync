const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { getRoutes } = require('expo-router/build/getRoutes');
const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig');
const {
  StackActions,
  StackRouter,
} = require('expo-router/build/react-navigation/routers/StackRouter');
const { getStateFromPath } = require('expo-router/build/fork/getStateFromPath');
const { getNavigationConfig } = require('expo-router/build/getLinkingConfig');
const { getNavigateAction } = require('expo-router/build/global-state/getNavigationAction');
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

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object') return [];
  return [node, ...elements(node.props?.children)];
}

function rootScreens(session) {
  const Stack = { Screen: 'screen', Protected: 'protected' };
  const Root = loadTypeScript('src/app/_layout.tsx', {
    'expo-router': { Stack },
    '@/features/academic/useAcademic': { AssistantClassesProvider: 'classes-provider' },
    '@/hooks/useAuth': { AuthProvider: 'provider', useAuth: () => session },
    '@/hooks/useNotifications': { useNotifications: () => ({}) },
  }).default;
  const navigator = Root().props.children.type();
  assert.equal(navigator.type, 'classes-provider');
  assert.equal(
    navigator.props.uid,
    session.phase === 'active' && session.role === 'asisten' ? session.user.uid : undefined,
  );
  return collectScreens(navigator.props.children.props.children, Stack.Screen).map(
    (screen) => screen.props.name,
  );
}

function tabs(role) {
  const Tabs = { Screen: 'tab', Protected: 'protected' };
  const Layout = loadTypeScript('src/app/(tabs)/_layout.tsx', {
    'expo-router': { Tabs, usePathname: () => '/jadwal' },
    'expo-status-bar': { StatusBar: 'status-bar' },
    'expo-symbols': { SymbolView: 'symbol' },
    'react-native': {
      Pressable: 'pressable',
      StyleSheet: { create: (s) => s },
      Text: 'text',
      View: 'view',
    },
    '@/hooks/useAuth': { useAuth: () => ({ role }) },
    '@/components/labsync-brand': {
      CsGraphLogo: 'cs-graph-logo',
      ScreenBackdrop: 'screen-backdrop',
    },
    '@/components/logout-button': { LogoutButton: 'logout-button' },
    '@/constants/theme': { BrandColors: {} },
  }).default;
  const tree = Layout();
  const tabsNode = Array.isArray(tree.props.children)
    ? tree.props.children.find((child) => child?.type === Tabs)
    : tree;
  return collectScreens(tabsNode.props.children, Tabs.Screen);
}

test('the root stack protects tabs and details by account phase and role', () => {
  assert.deepEqual(rootScreens({ user: null, phase: 'signed-out' }), ['index', 'register']);
  const user = { uid: 'account' };
  for (const phase of ['loading', 'verify', 'onboarding', 'disabled', 'error']) {
    assert.deepEqual(rootScreens({ user, phase, role: 'asisten' }), ['index']);
  }
  assert.deepEqual(rootScreens({ user, phase: 'active', role: 'asisten' }), [
    'index',
    '(tabs)',
    'asisten/kelas',
    'asisten/sesi',
  ]);
  assert.deepEqual(rootScreens({ user, phase: 'active', role: 'praktikan' }), [
    'index',
    '(tabs)',
    'praktikan/kelas-detail',
    'praktikan/presensi',
    'praktikan/ajukan-izin',
    'praktikan/ulasan',
  ]);
});

test('tabs expose the correct screens for each role', () => {
  assert.deepEqual(
    tabs('asisten').map((screen) => screen.props.name),
    ['jadwal', 'asisten/praktikum', 'asisten/izin', 'profil'],
  );
  assert.deepEqual(
    tabs('praktikan').map((screen) => screen.props.name),
    ['jadwal', 'praktikan/kelas', 'profil'],
  );
});

test('Expo Router resolves actual screen files without obsolete demo routes', () => {
  const dir = path.join(__dirname, '../src/app');
  const files = fs
    .readdirSync(dir, { recursive: true })
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => './' + file.replace(/\\/g, '/'));
  const context = () => ({ default: () => null });
  context.keys = () => files;
  const routeNode = getRoutes(context, { platform: 'android', importMode: 'lazy' });
  const config = getReactNavigationConfig(routeNode, true);
  function routeChain(url) {
    const routes = [];
    let state = getStateFromPath(url, config);
    while (state?.routes.length) {
      const route = state.routes.at(-1);
      routes.push(route);
      state = route.state;
    }
    return routes;
  }
  const leaf = (url) => routeChain(url).at(-1)?.name;
  assert.equal(leaf('/'), 'index');
  assert.notEqual(leaf('/demo'), 'demo');
  for (const detail of ['presensi', 'ajukan-izin', 'ulasan']) {
    const [route] = routeChain(`/praktikan/${detail}?classId=kelas1&sessionId=sesi1`);
    assert.equal(route.name, 'praktikan/' + detail);
    assert.deepEqual(route.params, { classId: 'kelas1', sessionId: 'sesi1' });
  }
  for (const tab of ['asisten/izin', 'praktikan/kelas', 'jadwal', 'profil']) {
    assert.deepEqual(
      routeChain('/' + tab).map(({ name }) => name),
      ['(tabs)', tab],
    );
  }
  const studentClassDetail = routeChain('/praktikan/kelas-detail?classId=basis-data');
  assert.deepEqual(
    studentClassDetail.map(({ name }) => name),
    ['praktikan/kelas-detail'],
  );
  assert.deepEqual(studentClassDetail.at(-1).params, { classId: 'basis-data' });
  assert.deepEqual(
    routeChain('/asisten/praktikum').map(({ name }) => name),
    ['(tabs)', 'asisten/praktikum'],
  );
  const classroom = routeChain('/asisten/kelas?classId=basis-data');
  assert.deepEqual(
    classroom.map(({ name }) => name),
    ['asisten/kelas'],
  );
  assert.deepEqual(classroom.at(-1).params, { classId: 'basis-data' });
  const session = routeChain('/asisten/sesi?classId=basis-data&sessionId=query');
  assert.deepEqual(
    session.map(({ name }) => name),
    ['asisten/sesi'],
  );
  assert.deepEqual(session.at(-1).params, { classId: 'basis-data', sessionId: 'query' });

  const tabsRoute = {
    key: 'app-tabs',
    name: '(tabs)',
    state: { index: 1, routes: [{ name: 'jadwal' }, { name: 'asisten/praktikum' }] },
  };
  const stack = {
    stale: false,
    type: 'stack',
    key: 'app-stack',
    routeKeySeq: 0,
    index: 0,
    routeNames: ['index', '(tabs)', 'asisten/kelas', 'asisten/sesi'],
    routes: [tabsRoute],
  };
  const router = StackRouter({ initialRouteName: 'index' });
  const options = { routeParamList: {}, routeGetIdList: {} };
  const registry = new Map([
    [stack.key, { reduce: (state, action) => router.getStateForAction(state, action, options) }],
  ]);
  const linking = { config: getNavigationConfig(routeNode, true, {}), getStateFromPath };
  let currentStack = { ...stack, routes: [{ key: 'login', name: 'index' }] };

  function navigate(href, type = 'PUSH') {
    const navigationState = { index: 0, routes: [{ name: '__root', state: currentStack }] };
    const { action } = getNavigateAction(
      href,
      {},
      { routeNode, registry, linking, redirects: [] },
      type,
      false,
      undefined,
      undefined,
      navigationState,
    );
    assert.equal(action.target, stack.key);
    currentStack = router.getStateForAction(currentStack, action, options).state;
    return currentStack.routes[currentStack.index];
  }

  const landing = navigate('/jadwal', 'REPLACE');
  assert.equal(landing.name, '(tabs)');
  assert.equal(landing.state.routes[landing.state.index].name, 'jadwal');
  assert.equal(currentStack.routes.length, 1);
  currentStack = stack;

  assert.deepEqual(
    navigate('/asisten/sesi?classId=basis-data&sessionId=query').params,
    session.at(-1).params,
  );
  currentStack = router.getStateForAction(currentStack, StackActions.pop(), options).state;
  assert.deepEqual(currentStack.routes[currentStack.index], tabsRoute);

  assert.deepEqual(navigate('/asisten/kelas?classId=basis-data').params, classroom.at(-1).params);
  const classOpened = currentStack;
  const review = navigate('/asisten/sesi?classId=basis-data&sessionId=query&section=ulasan');
  assert.equal(review.name, 'asisten/sesi');
  assert.deepEqual(review.params, { ...session.at(-1).params, section: 'ulasan' });
  const returned = router.getStateForAction(currentStack, StackActions.pop(), options).state;
  assert.deepEqual(returned.routes[returned.index], classOpened.routes[classOpened.index]);
  const list = router.getStateForAction(returned, StackActions.pop(), options).state;
  assert.deepEqual(list.routes[list.index], tabsRoute);

  const studentTabs = {
    ...tabsRoute,
    state: { index: 0, routes: [{ name: 'jadwal' }, { name: 'praktikan/riwayat' }] },
  };
  const student = { user: { uid: 'student' }, phase: 'active', role: 'praktikan' };
  currentStack = { ...stack, routeNames: rootScreens(student), routes: [studentTabs] };
  const attendance = navigate('/praktikan/presensi?classId=basis-data&sessionId=query');
  assert.equal(attendance.name, 'praktikan/presensi');
  assert.deepEqual(attendance.params, session.at(-1).params);
  const schedule = router.getStateForAction(currentStack, StackActions.pop(), options).state;
  assert.deepEqual(schedule.routes[schedule.index], studentTabs);

  const loggedOut = router.getStateForAction(
    currentStack,
    {
      type: 'ROUTE_NAMES_CHANGED',
      payload: { routeNames: rootScreens({ user: null, phase: 'signed-out' }) },
    },
    options,
  ).state;
  assert.deepEqual(
    loggedOut.routes.map(({ name }) => name),
    ['index'],
  );

  assert.equal(leaf('/profil'), 'profil');
  assert.notEqual(leaf('/asisten-sesi'), 'asisten-sesi');
});

test('session detail opens the selected tab and loads data only for that tab', () => {
  let selectedTab;
  let initialSection;
  let backed = false;
  let attendanceSession;
  let summarySession;
  const session = {
    id: 'query',
    classId: 'basis-data',
    className: 'Basis Data B',
    module: 'Kueri SQL',
    room: 'Lab',
    startsAt: { toDate: () => new Date(0) },
    date: '2026-11-22',
    startTime: '09:00',
    endTime: '11:00',
    timeZone: 'Asia/Jakarta',
    status: 'closed',
  };
  const data = (value) => ({ value, loading: false, error: null });
  const { default: AssistantSessionRoute } = loadTypeScript(
    'src/features/academic/assistant-session.tsx',
    {
      'expo-image': { Image: 'image' },
      'expo-status-bar': { StatusBar: 'status-bar' },
      'expo-symbols': { SymbolView: 'symbol' },
      '../../../assets/images/arrow-back-light.svg': 'arrow-back-light',
      'expo-router': {
        router: {
          canGoBack: () => true,
          back: () => {
            backed = true;
          },
        },
        useLocalSearchParams: () => ({
          classId: 'basis-data',
          sessionId: 'query',
          section: initialSection,
        }),
      },
      react: {
        useRef: (current) => ({ current }),
        useState: (initial) =>
          initial
            ? [
                selectedTab ?? initial,
                (next) => {
                  selectedTab = next;
                },
              ]
            : [initial, () => {}],
      },
      'react-native': {
        View: 'view',
        Text: 'text',
        Pressable: 'button',
        ScrollView: 'scroll',
        ActivityIndicator: 'indicator',
      },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      '@/components/auth-screen': { AuthButton: 'auth-button' },
      '@/components/labsync-brand': {
        BottomSheetModal: 'bottom-sheet-modal',
        DarkContourOverlay: 'dark-contour',
        DarkGradientOverlay: 'dark-gradient',
        DiagonalHatchOverlay: 'diagonal-hatch',
        ScreenBackdrop: 'screen-backdrop',
      },
      '@/constants/theme': {
        BrandColors: {},
        SessionStatusStyles: { closed: { label: 'Selesai' } },
      },
      '@/hooks/useAuth': { useAuth: () => ({ user: { uid: 'asisten' }, role: 'asisten' }) },
      '@/lib/mutations': {},
      '@/features/academic/useAcademic': {
        useAssistantSession: (classId, sessionId) => {
          assert.deepEqual([classId, sessionId], ['basis-data', 'query']);
          return data(session);
        },
        useSessionAttendance: (_uid, id) => {
          attendanceSession = id;
          return data([]);
        },
        useSessionReviewSummary: (_uid, classId, id) => {
          summarySession = [classId, id];
          return data({
            totalSubmitted: 1,
            positiveCount: 1,
            neutralCount: 0,
            negativeCount: 0,
            pendingCount: 0,
            failedCount: 0,
          });
        },
      },
      '@/features/academic/time': {
        formatSessionRange: () => '09.00–11.00',
        formatDateTime: () => '09.00',
      },
      './assistant-session.styles': { styles: {} },
    },
  );

  const tree = () => elements(AssistantSessionRoute());
  const includesLabel = (nodes, text) => nodes.some((node) => node.props.children === text);
  const initial = tree();
  assert.ok(includesLabel(initial, 'Rekap presensi'));
  assert.ok(!includesLabel(initial, 'Sentimen ulasan mahasiswa'));
  assert.equal(attendanceSession, 'query');
  assert.deepEqual(summarySession, [null, null]);
  initial
    .find(
      (node) =>
        node.props.accessibilityRole === 'tab' &&
        node.props.children?.props?.children === 'Ulasan & AI',
    )
    .props.onPress();
  assert.ok(includesLabel(tree(), 'Sentimen ulasan mahasiswa'));
  assert.ok(!includesLabel(tree(), 'Rekap presensi'));
  assert.equal(attendanceSession, null);
  assert.deepEqual(summarySession, ['basis-data', 'query']);

  selectedTab = undefined;
  initialSection = 'ulasan';
  const reviews = tree();
  assert.ok(includesLabel(reviews, 'Sentimen ulasan mahasiswa'));
  reviews.find((node) => node.props.accessibilityLabel === 'Kembali').props.onPress();
  assert.equal(backed, true);
});

test('an enrolled student can check in before attendance or permit documents exist', () => {
  const time = { toDate: () => new Date(0) };
  const data = {
    'classes/kelas-a': { name: 'Basis Data', timeZone: 'Asia/Jakarta' },
    'classes/kelas-a/sessions/sesi-a': {
      moduleTitle: 'Kueri SQL',
      room: 'Lab',
      startsAt: time,
      endsAt: time,
      status: 'open',
    },
  };
  const reads = [];
  const { StudentSession } = loadTypeScript('src/features/participation/student.tsx', {
    'expo-image': { Image: 'image' },
    'expo-router': { useLocalSearchParams: () => ({ classId: 'kelas-a', sessionId: 'sesi-a' }) },
    'expo-status-bar': { StatusBar: 'status-bar' },
    'expo-symbols': { SymbolView: 'symbol' },
    '../../../assets/images/arrow-back-light.svg': 'arrow-back-light',
    react: { useState: (initial) => [initial, () => {}], useRef: (current) => ({ current }) },
    'react-native': {
      Pressable: 'button',
      ScrollView: 'scroll',
      StyleSheet: { create: (s) => s },
      Text: 'text',
      View: 'view',
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/features/academic/time': {
      classLocalDateTime: () => ({ date: '2026-11-22', time: '09:00' }),
      formatDateTime: () => '09.00',
    },
    '@/features/academic/useAcademic': {
      useStudentClasses: () => ({ value: [], loading: false, error: null, retry: () => {} }),
    },
    '@/components/auth-screen': { AuthButton: 'auth-button', AuthError: 'auth-error' },
    '@/components/labsync-brand': {
      ConcentricArcOverlay: 'arc',
      CornerDotAccent: 'corner-dots',
      DarkContourOverlay: 'dark-contour',
      DarkGradientOverlay: 'dark-gradient',
      DiagonalHatchOverlay: 'diagonal-hatch',
      ScreenBackdrop: 'screen-backdrop',
    },
    '@/constants/theme': { BrandColors: {}, SessionStatusStyles: { open: { label: 'Dibuka' } } },
    '@/hooks/useAuth': { useAuth: () => ({ user: { uid: 'praktikan-a' }, role: 'praktikan' }) },
    '@/lib/mutations': {},
    './data': {
      useLive: (_uid, source) => {
        if (source) reads.push(source);
        return { data: data[source?.path] ?? null, loading: false, error: null, offline: false };
      },
    },
    './ui': { Page: 'page', Feedback: 'feedback', Card: 'card', styles: {} },
    './use-review-access': {},
  });
  const detail = StudentSession();
  const nodes = elements(detail.type(detail.props));
  assert.deepEqual(
    reads.map(({ kind, path }) => [kind, path]),
    [
      ['doc', 'classes/kelas-a'],
      ['doc', 'classes/kelas-a/sessions/sesi-a'],
      ['doc', 'attendances/sesi-a~praktikan-a'],
      ['doc', 'permits/sesi-a~praktikan-a'],
    ],
  );
  for (const title of ['Presensi sekarang', 'Ajukan izin']) {
    assert.ok(nodes.some(({ type, props }) => type === 'auth-button' && props.title === title));
  }
});
