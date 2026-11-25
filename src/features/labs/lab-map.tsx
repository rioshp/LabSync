import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuthButton } from '@/components/auth-screen';
import { Feedback, Page, styles } from '@/features/participation/ui';
import type { Coordinates } from '@/lib/location';
import LabActivitySheet from './lab-activity-sheet';
import { LocationStatus } from './location-status';
import MapScene from './map-scene';
import { useDeviceLocation, useLabs } from './useLabs';

export default function LabMap() {
  const labs = useLabs();
  const location = useDeviceLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapTouching, setMapTouching] = useState(false);
  const [focus, setFocus] = useState<Coordinates | null>(null);
  const selected = labs.items.find((lab) => lab.id === selectedId);
  return (
    <Page
      tabScreen
      title="Peta laboratorium"
      subtitle="Temukan lokasi lab dan aktivitas praktikum terkini."
      scrollEnabled={!mapTouching}
    >
      <Feedback {...labs} />
      {!labs.loading && !labs.error ? (
        <MapScene
          onTouchChange={setMapTouching}
          labs={labs.items}
          selectedLabId={selectedId}
          onSelectLab={(id) => {
            setSelectedId(id);
            setFocus(labs.items.find((lab) => lab.id === id) ?? null);
          }}
          userLocation={location.sample}
          focusPoint={focus}
        />
      ) : null}
      {selected ? (
        <LabActivitySheet
          key={selected.id}
          lab={selected}
          userLocation={location.sample}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
      <LocationStatus location={location} />
      {location.sample ? (
        <AuthButton
          title="Pusatkan ke posisi saya"
          variant="soft"
          onPress={() => setFocus(location.sample)}
        />
      ) : null}
      {!labs.loading && !labs.error && !labs.items.length ? (
        <Text style={styles.muted}>Belum ada laboratorium aktif.</Text>
      ) : null}
      <View style={{ gap: 8 }}>
        {labs.items.map((lab) => (
          <Pressable
            key={lab.id}
            accessibilityRole="button"
            accessibilityLabel={`Lihat aktivitas ${lab.name}`}
            style={styles.card}
            onPress={() => {
              setSelectedId(lab.id);
              setFocus(lab);
            }}
          >
            <Text style={styles.heading}>{lab.name}</Text>
            <Text style={styles.muted}>{lab.description || 'Lihat aktivitas dan jadwal'}</Text>
          </Pressable>
        ))}
      </View>
    </Page>
  );
}
