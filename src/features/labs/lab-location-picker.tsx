import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AuthButton, AuthError, AuthField } from '@/components/auth-screen';
import { Confirm, styles } from '@/features/participation/ui';
import { MIN_RADIUS_METERS, MAX_RADIUS_METERS, readCoordinates, readRadius, type Coordinates } from '@/lib/location';
import MapScene from './map-scene';
import { LocationStatus } from './location-status';
import { useDeviceLocation } from './useLabs';

export type LabLocationDraft = Coordinates & { radiusMeters: number };

export function parseCoordinateInput(value: string) {
  if (!value.trim()) throw new Error('Isi koordinat lokasi terlebih dahulu.');
  const number = Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(number)) throw new Error('Koordinat harus berupa angka.');
  return number;
}

export default function LabLocationPicker({
  value,
  onConfirm,
  onCancel,
}: {
  value: LabLocationDraft | null;
  onConfirm: (value: LabLocationDraft) => void;
  onCancel: () => void;
}) {
  const location = useDeviceLocation(true, true);
  const initialized = useRef(!!value);
  const [moving, setMoving] = useState(false);
  const [mapTouching, setMapTouching] = useState(false);
  const [manual, setManual] = useState(false);
  const [point, setPoint] = useState<Coordinates | null>(value);
  const [latitude, setLatitude] = useState(value ? String(value.latitude) : '');
  const [longitude, setLongitude] = useState(value ? String(value.longitude) : '');
  const [radius, setRadius] = useState(String(value?.radiusMeters ?? 50));
  const [focus, setFocus] = useState<Coordinates | null>(value);
  const [error, setError] = useState<string | null>(null);
  const numericRadius = Number(radius);
  const validRadius = Number.isFinite(numericRadius) && numericRadius >= MIN_RADIUS_METERS && numericRadius <= MAX_RADIUS_METERS;
  function choose(next: Coordinates) {
    setPoint(next);
    initialized.current = true;
    setLatitude(String(next.latitude));
    setLongitude(String(next.longitude));
    setError(null);
  }
  useEffect(() => {
    if (initialized.current || !location.sample) return;
    initialized.current = true;
    const next = readCoordinates(location.sample);
    setPoint(next);
    setLatitude(String(next.latitude));
    setLongitude(String(next.longitude));
  }, [location.sample]);
  function confirm() {
    try {
      const coordinates = readCoordinates({
        latitude: parseCoordinateInput(latitude),
        longitude: parseCoordinateInput(longitude),
      });
      onConfirm({ ...coordinates, radiusMeters: readRadius(numericRadius) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lokasi tidak valid.');
    }
  }
  return (
    <Confirm
      title="Pilih wilayah laboratorium"
      onCancel={onCancel}
      scrollEnabled={!mapTouching}
    >
      <MapScene
        centerPicker
        onMovingChange={setMoving}
        onTouchChange={setMapTouching}
        draft={point && validRadius ? { ...point, radiusMeters: numericRadius } : null}
        userLocation={location.sample}
        focusPoint={focus}
        onSelectPoint={choose}
      />
      {!location.sample ? <LocationStatus location={location} /> : null}
      {location.sample ? (
        <AuthButton
          title="Kembali ke posisi saya"
          variant="soft"
          onPress={() => {
            const next = readCoordinates(location.sample);
            choose(next);
            setFocus(next);
          }}
        />
      ) : null}
      <View style={{ gap: 12 }}>
        {point ? (
          <Text style={styles.muted}>
            {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
          </Text>
        ) : null}
        <AuthButton
          title={manual ? 'Tutup koordinat manual' : 'Isi koordinat manual'}
          variant="outline"
          onPress={() => setManual(!manual)}
        />
        {manual ? (
          <>
            <AuthField
              label="Latitude"
              value={latitude}
              onChangeText={(text) => {
                initialized.current = true;
                setLatitude(text);
                setPoint(null);
              }}
              keyboardType="numbers-and-punctuation"
              placeholder="Contoh: -7.123456"
            />
            <AuthField
              label="Longitude"
              value={longitude}
              onChangeText={(text) => {
                initialized.current = true;
                setLongitude(text);
                setPoint(null);
              }}
              keyboardType="numbers-and-punctuation"
              placeholder="Contoh: 110.123456"
            />
          </>
        ) : null}
        <AuthField
          label="Radius presensi (10–100 meter)"
          value={radius}
          onChangeText={setRadius}
          keyboardType="decimal-pad"
        />
        {!validRadius ? (
          <AuthError message="Isi radius 10–100 meter. Lingkaran disembunyikan sampai nilainya valid." />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[10, 30, 50, 100].map((meters) => (
            <View key={meters} style={{ flex: 1 }}>
              <AuthButton
                title={`${meters} m`}
                variant="outline"
                onPress={() => setRadius(String(meters))}
              />
            </View>
          ))}
        </View>
        <AuthError message={error} />
        <AuthButton
          title="Gunakan lokasi ini"
          disabled={moving || !validRadius || (!point && !manual)}
          onPress={confirm}
        />
      </View>
    </Confirm>
  );
}
