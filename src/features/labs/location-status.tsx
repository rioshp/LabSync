import { Text, View } from 'react-native';
import { AuthButton } from '@/components/auth-screen';
import { styles } from '@/features/participation/ui';
import type { useDeviceLocation } from './useLabs';

export function LocationStatus({ location }: { location: ReturnType<typeof useDeviceLocation> }) {
  return (
    <View style={{ gap: 10 }}>
      {location.error ? (
        <Text accessibilityRole="alert" style={styles.muted}>
          {location.error.message}
        </Text>
      ) : !location.sample && !location.stale ? (
        <Text style={styles.muted}>
          Posisi perangkat belum tersedia.
        </Text>
      ) : null}
      {location.error?.code === 'blocked' ? (
        <AuthButton
          title="Buka pengaturan lokasi"
          variant="outline"
          onPress={location.openSettings}
        />
      ) : null}
      <AuthButton
        title={
          location.loading
            ? 'Memeriksa lokasi…'
            : location.sample
              ? 'Perbarui lokasi saya'
              : 'Gunakan lokasi saya'
        }
        variant="outline"
        busy={location.loading}
        onPress={location.retry}
      />
    </View>
  );
}
