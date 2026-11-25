const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTypeScript } = require('./load-typescript.cjs');
const location = loadTypeScript('src/lib/location.ts');
const center = { latitude: -7, longitude: 110 };
const now = 1_800_000_000_000;
const sample = { ...center, accuracy: 5, capturedAt: now };

test('Haversine measures meters, wraps the date line and rejects nonfinite coordinates', () => {
  assert.equal(location.calculateDistanceMeters(center, center), 0);
  assert.ok(
    Math.abs(
      location.calculateDistanceMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ) - 111194.927,
    ) < 0.1,
  );
  assert.ok(
    location.calculateDistanceMeters(
      { latitude: 0, longitude: 179.999 },
      { latitude: 0, longitude: -179.999 },
    ) < 223,
  );
  for (const invalid of [NaN, Infinity, -Infinity, 91]) {
    assert.throws(() => location.readCoordinates({ latitude: invalid, longitude: 0 }));
  }
  assert.deepEqual(location.readCoordinates({ latitude: 0, longitude: 0 }), {
    latitude: 0,
    longitude: 0,
  });
});

test('proximity uses the session radius and never subtracts GPS uncertainty', () => {
  const point = { ...sample, latitude: center.latitude + 0.0005 };
  assert.equal(location.evaluateLabProximity(point, center, 50, now).inside, false);
  assert.equal(location.evaluateLabProximity(point, center, 100, now).inside, true);
  assert.equal(location.evaluateLabProximity(sample, center, 30, now).inside, true);
});

test('check-in requires fresh accurate nonmocked samples and bounded radii', () => {
  for (const change of [
    { capturedAt: now - 15_001 },
    { capturedAt: now + 5_001 },
    { accuracy: null },
    { accuracy: 31 },
    { accuracy: -1 },
    { mocked: true },
  ]) {
    assert.throws(() => location.readCheckInLocation({ ...sample, ...change }, now));
  }
  for (const radius of [0, 9, 101, Infinity, NaN, '50'])
    assert.throws(() => location.readRadius(radius));
  assert.equal(location.readRadius(10), 10);
  assert.equal(location.readRadius(30), 30);
  assert.equal(location.readRadius(100), 100);
});
