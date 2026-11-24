const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Timestamp } = require('firebase/firestore');
const { loadTypeScript } = require('./load-typescript.cjs');
const input = loadTypeScript('src/lib/firestore-input.ts');
const location = loadTypeScript('src/lib/location.ts');
const labData = {
  name: 'Lab A',
  description: 'Gedung A',
  latitude: -7,
  longitude: 110,
  radiusMeters: 50,
  status: 'active',
  assistantUid: 'assistant-a',
};

function setup() {
  const listeners = [];
  const firestore = {
    Timestamp,
    collection: (_db, path) => path,
    where: (...args) => ({ where: args }),
    orderBy: (...args) => ({ orderBy: args }),
    query: (path, ...constraints) => ({ path, constraints }),
    onSnapshot: (source, _meta, onChange, onError) => {
      const listener = { source, onChange, onError, stopped: false };
      listeners.push(listener);
      return () => {
        listener.stopped = true;
      };
    },
  };
  const labs = loadTypeScript('src/lib/labs.ts', {
    '@react-native-firebase/firestore': firestore,
    './firebase': { db: {} },
    './firestore-input': input,
    './location': location,
  });
  return { labs, listeners };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('lab listeners are scoped to active labs and stop late callbacks after unmount', async () => {
  const { labs, listeners } = setup();
  const results = [];
  const stop = labs.subscribeLabs({
    onChange: (items, offline) => results.push({ items, offline }),
    onError: assert.fail,
  });
  await tick();
  const listener = listeners[0];
  assert.deepEqual(listener.source.constraints[0], { where: ['status', '==', 'active'] });
  const snapshot = { docs: [{ id: 'lab-a', data: () => labData }], metadata: { fromCache: false } };
  listener.onChange(snapshot);
  assert.equal(results[0].items[0].name, 'Lab A');
  assert.equal(results[0].offline, false);
  stop();
  listener.onChange(snapshot);
  assert.equal(results.length, 1);
  assert.equal(listener.stopped, true);
});

test('lab activity subscriptions preserve open sessions and cancel safely before Firebase loads', async () => {
  const { labs, listeners } = setup();
  const stop = labs.subscribeLabSchedules('lab-a', { onChange: () => {}, onError: assert.fail });
  stop();
  await tick();
  assert.equal(listeners.length, 0);
  const stopNext = labs.subscribeLabSchedules('lab-b', {
    onChange: () => {},
    onError: assert.fail,
  });
  await tick();
  assert.deepEqual(listeners[0].source.constraints.slice(0, 2), [
    { where: ['labId', '==', 'lab-b'] },
    { where: ['status', 'in', ['open', 'scheduled']] },
  ]);
  stopNext();
});

test('malformed labs are surfaced as errors instead of silently hiding markers', async () => {
  const { labs, listeners } = setup();
  let error;
  const stop = labs.subscribeLabs({
    onChange: assert.fail,
    onError: (value) => {
      error = value;
    },
  });
  await tick();
  listeners[0].onChange({
    docs: [{ id: 'bad', data: () => ({ ...labData, latitude: NaN }) }],
    metadata: { fromCache: false },
  });
  assert.match(error.message, /Koordinat/);
  stop();
});

test('activity selection keeps overdue open sessions and orders future scheduled sessions', () => {
  const { selectLabActivities } = loadTypeScript('src/features/labs/activity.ts');
  const entry = (id, status, startsAt) => ({
    id,
    status,
    startsAt: Timestamp.fromMillis(startsAt),
  });
  const selected = selectLabActivities(
    [
      entry('later', 'scheduled', 300),
      entry('overdue', 'open', 1),
      entry('past', 'scheduled', 2),
      entry('next', 'scheduled', 200),
      entry('cancelled', 'cancelled', 150),
    ],
    100,
  );
  assert.deepEqual(
    selected.ongoing.map((item) => item.id),
    ['overdue'],
  );
  assert.deepEqual(
    selected.upcoming.map((item) => item.id),
    ['next', 'later'],
  );
});
