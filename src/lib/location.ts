export type Coordinates = { latitude: number; longitude: number };
export type DeviceLocation = Coordinates & {
  accuracy: number | null;
  capturedAt: number;
  mocked?: boolean;
};

export const MIN_RADIUS_METERS = 10;
export const MAX_RADIUS_METERS = 100;
export const MAX_LOCATION_AGE_MS = 15_000;
export const MAX_LOCATION_ACCURACY_METERS = 30;

export type LocationErrorCode = 'denied' | 'blocked' | 'services-off' | 'timeout' | 'unavailable';

export class LocationError extends Error {
  constructor(
    public readonly code: LocationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LocationError';
  }
}

export function readCoordinates(value: unknown): Coordinates {
  const point = value as Partial<Coordinates> | null;
  if (
    !point ||
    typeof point.latitude !== 'number' ||
    !Number.isFinite(point.latitude) ||
    typeof point.longitude !== 'number' ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  )
    throw new Error('Koordinat lokasi tidak valid.');
  return { latitude: point.latitude, longitude: point.longitude };
}

export function readRadius(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < MIN_RADIUS_METERS ||
    value > MAX_RADIUS_METERS
  ) {
    throw new Error(`Radius harus antara ${MIN_RADIUS_METERS} dan ${MAX_RADIUS_METERS} meter.`);
  }
  return value;
}

export function calculateDistanceMeters(from: Coordinates, to: Coordinates): number {
  readCoordinates(from);
  readCoordinates(to);
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = radians(to.latitude - from.latitude);
  const lonDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(lonDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}

export function readCheckInLocation(value: unknown, now = Date.now()): DeviceLocation {
  const coordinates = readCoordinates(value);
  const sample = value as Partial<DeviceLocation>;
  if (sample.mocked === true) throw new Error('Tutup lokasi simulasi sebelum melakukan presensi.');
  if (
    typeof sample.capturedAt !== 'number' ||
    !Number.isFinite(sample.capturedAt) ||
    now - sample.capturedAt > MAX_LOCATION_AGE_MS ||
    sample.capturedAt > now + 5_000
  ) {
    throw new Error('Lokasi sudah kedaluwarsa. Ambil ulang lokasi lalu coba lagi.');
  }
  if (
    typeof sample.accuracy !== 'number' ||
    !Number.isFinite(sample.accuracy) ||
    sample.accuracy <= 0 ||
    sample.accuracy > MAX_LOCATION_ACCURACY_METERS
  ) {
    throw new Error('Lokasi belum cukup akurat. Aktifkan lokasi presisi lalu coba lagi.');
  }
  return { ...coordinates, accuracy: sample.accuracy, capturedAt: sample.capturedAt };
}

export function evaluateLabProximity(
  sample: unknown,
  lab: Coordinates,
  radius: number,
  now = Date.now(),
) {
  const location = readCheckInLocation(sample, now);
  const radiusMeters = readRadius(radius);
  const distanceMeters = calculateDistanceMeters(location, lab);
  return { inside: distanceMeters <= radiusMeters, distanceMeters, radiusMeters };
}

async function prepareLocation(requestPermission: boolean) {
  try {
    const location = await import('expo-location');
    let permission = await location.getForegroundPermissionsAsync();
    if (!permission.granted && requestPermission && permission.canAskAgain) {
      permission = await location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) {
      throw new LocationError(
        permission.canAskAgain ? 'denied' : 'blocked',
        permission.canAskAgain
          ? 'Izinkan lokasi untuk melihat posisi dan melakukan presensi.'
          : 'Izin lokasi diblokir. Aktifkan lokasi melalui pengaturan perangkat.',
      );
    }
    if (!(await location.hasServicesEnabledAsync())) {
      throw new LocationError('services-off', 'GPS mati. Aktifkan layanan lokasi lalu coba lagi.');
    }
    return location;
  } catch (error) {
    throw locationError(error);
  }
}

export function locationError(error: unknown): LocationError {
  return error instanceof LocationError
    ? error
    : new LocationError(
        'unavailable',
        'Lokasi belum tersedia. Periksa GPS dan gunakan development build terbaru, lalu coba lagi.',
      );
}

export async function getFreshLocation(requestPermission = true): Promise<DeviceLocation> {
  const location = await prepareLocation(requestPermission);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      location.getCurrentPositionAsync({ accuracy: location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new LocationError(
                'timeout',
                'Lokasi belum ditemukan. Pindah ke area dengan sinyal GPS lebih baik lalu coba lagi.',
              ),
            ),
          15_000,
        );
      }),
    ]);
    return { ...position.coords, capturedAt: position.timestamp, mocked: position.mocked };
  } catch (error) {
    throw locationError(error);
  } finally {
    clearTimeout(timer);
  }
}

export async function watchUserLocation(
  onChange: (sample: DeviceLocation) => void,
  onError: (error: LocationError) => void,
  requestPermission = false,
): Promise<() => void> {
  const location = await prepareLocation(requestPermission);
  let active = true;
  let latestTimestamp = -Infinity;
  function publish(sample: DeviceLocation) {
    if (!active || sample.capturedAt < latestTimestamp) return;
    latestTimestamp = sample.capturedAt;
    onChange(sample);
  }
  const subscription = await location.watchPositionAsync(
    { accuracy: location.Accuracy.High, timeInterval: 3_000, distanceInterval: 3 },
    (position) => {
      publish({ ...position.coords, capturedAt: position.timestamp, mocked: position.mocked });
    },
    () => {
      if (active)
        onError(
          new LocationError(
            'unavailable',
            'Pembaruan lokasi terhenti. Periksa GPS lalu coba lagi.',
          ),
        );
    },
  );
  void getFreshLocation(false)
    .then(publish)
    .catch((error) => {
      // A delayed initial request must not replace a newer watcher result with an error.
      if (active && latestTimestamp === -Infinity) onError(locationError(error));
    });
  return () => {
    active = false;
    subscription.remove();
  };
}
