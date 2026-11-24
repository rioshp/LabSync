import { readCoordinates, readRadius, type Coordinates } from '@/lib/location';

export function toMapCoordinate(point: Coordinates): [number, number] {
  return [point.longitude, point.latitude];
}

export function fromMapCoordinate([longitude, latitude]: [number, number]): Coordinates {
  return readCoordinates({ latitude, longitude });
}

type RadiusFeature = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'Polygon'; coordinates: number[][][] };
};

// GeoJSON uses longitude first; radius is geographic meters, not screen pixels.
export function createRadiusFeature(center: Coordinates, radiusMeters: number): RadiusFeature {
  readCoordinates(center);
  const angularDistance = readRadius(radiusMeters) / 6_371_000;
  const latitude = (center.latitude * Math.PI) / 180;
  const longitude = (center.longitude * Math.PI) / 180;
  const ring: number[][] = [];

  for (let step = 0; step < 64; step += 1) {
    const bearing = (step * 2 * Math.PI) / 64;
    const sinLatitude =
      Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing);
    const nextLatitude = Math.asin(Math.max(-1, Math.min(1, sinLatitude)));
    const nextLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
      );
    ring.push([
      (((nextLongitude * 180) / Math.PI + 540) % 360) - 180,
      (nextLatitude * 180) / Math.PI,
    ]);
  }
  ring.push([...ring[0]]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

// MapLibre uses a 512-point Web Mercator world at zoom zero.
export function metersPerMapPoint(latitude: number, zoom: number): number {
  const clampedLatitude = Math.max(-85, Math.min(85, latitude));
  return (2 * Math.PI * 6_378_137 * Math.cos(clampedLatitude * Math.PI / 180)) / (512 * 2 ** zoom);
}

export function zoomForRadius(latitude: number, radiusMeters: number, viewportSize: number): number {
  const diameter = Math.max(64, viewportSize - 96);
  const metersPerPoint = 2 * readRadius(radiusMeters) / diameter;
  return Math.max(1, Math.min(22, Math.log2(metersPerMapPoint(latitude, 0) / metersPerPoint)));
}
