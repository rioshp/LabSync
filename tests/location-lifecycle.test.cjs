const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTypeScript } = require('./load-typescript.cjs');

function harness(watchUserLocation) {
  const writes = [];
  const focusEffects = [];
  const cleanups = [];
  let removed = 0;
  const hooks = loadTypeScript('src/features/labs/useLabs.ts', {
    'expo-router': { useFocusEffect: (effect) => focusEffects.push(effect) },
    react: {
      useCallback: (callback) => callback,
      useEffect: (effect) => cleanups.push(effect()),
      useState: (value) => [
        typeof value === 'function' ? value() : value,
        (next) => writes.push(next),
      ],
    },
    'react-native': {
      AppState: { currentState: 'active', addEventListener: () => ({ remove: () => removed++ }) },
      Linking: { openSettings: async () => {} },
    },
    '@/hooks/useAuth': { useAuth: () => ({ user: { uid: 'student-a' }, phase: 'active' }) },
    '@/lib/labs': {},
    '@/lib/location': {
      watchUserLocation,
      locationError: (error) => error,
      MAX_LOCATION_AGE_MS: 15000,
    },
    '@/lib/mutations': { mutationError: (error) => error.message },
  });
  return { hooks, writes, focusEffects, cleanups, removed: () => removed };
}

test('a late native location subscription is removed when the page loses focus', async () => {
  let finish;
  let change;
  let stopped = 0;
  const h = harness((onChange) => {
    change = onChange;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  h.hooks.useDeviceLocation();
  const blur = h.focusEffects[0]();
  blur();
  finish(() => stopped++);
  await new Promise((resolve) => setImmediate(resolve));
  change({ latitude: 0, longitude: 0, capturedAt: Date.now(), accuracy: 5 });
  assert.equal(stopped, 1);
  assert.equal(h.writes.length, 0);
  h.cleanups.forEach((cleanup) => cleanup?.());
  assert.equal(h.removed(), 1);
});

test('an already recorded attendance does not activate GPS monitoring', () => {
  const h = harness(() => {
    throw new Error('GPS must not be requested');
  });
  const result = h.hooks.useDeviceLocation(false);
  assert.equal(h.focusEffects[0](), undefined);
  assert.equal(result.sample, null);
  assert.equal(result.loading, false);
  h.cleanups.forEach((cleanup) => cleanup?.());
});
