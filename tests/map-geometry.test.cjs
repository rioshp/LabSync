const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadTypeScript } = require('./load-typescript.cjs');
const location = loadTypeScript('src/lib/location.ts');
const geometry = loadTypeScript('src/features/labs/map-geometry.ts', {
  '@/lib/location': location,
});

test('MapLibre coordinates preserve longitude-first order in both directions', () => {
  const point = { latitude: -7, longitude: 110 };
  assert.deepEqual(geometry.toMapCoordinate(point), [110, -7]);
  assert.deepEqual(geometry.fromMapCoordinate([110, -7]), point);
  assert.throws(() => geometry.fromMapCoordinate([110, 91]));
});

test('the displayed geofence is a closed polygon with the requested radius in meters', () => {
  const center = { latitude: -7, longitude: 110 };
  for (const radius of [10, 30, 50, 100]) {
    const feature = geometry.createRadiusFeature(center, radius);
    const ring = feature.geometry.coordinates[0];
    assert.equal(feature.type, 'Feature');
    assert.equal(feature.geometry.type, 'Polygon');
    assert.equal(ring.length, 65);
    assert.deepEqual(ring[0], ring[ring.length - 1]);
    for (const coordinates of ring) {
      const distance = location.calculateDistanceMeters(
        center,
        geometry.fromMapCoordinate(coordinates),
      );
      assert.ok(Math.abs(distance - radius) < 0.01);
    }
  }
  assert.throws(() => geometry.createRadiusFeature(center, 0));
  assert.throws(() => geometry.createRadiusFeature({ latitude: NaN, longitude: 110 }, 50));
});

test('radius fitting keeps the complete circle within the viewport at different latitudes', () => {
  for (const latitude of [-7, 0, 60]) {
    for (const viewport of [240, 320, 400]) {
      for (const radius of [10, 30, 50, 100]) {
        const zoom = geometry.zoomForRadius(latitude, radius, viewport);
        const diameter = 2 * radius / geometry.metersPerMapPoint(latitude, zoom);
        assert.ok(Math.abs(diameter - (viewport - 96)) < 0.001);
      }
    }
    const small = geometry.zoomForRadius(latitude, 50, 320);
    const large = geometry.zoomForRadius(latitude, 100, 320);
    assert.ok(Math.abs(small - large - 1) < 0.001);
  }
});

test('at unchanged camera zoom, a 10-meter radius is one fifth of a 50-meter radius', () => {
  const scale = geometry.metersPerMapPoint(-7, 17);
  assert.ok(Math.abs((2 * 10 / scale) / (2 * 50 / scale) - 0.2) < 1e-12);
});
