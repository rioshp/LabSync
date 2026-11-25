import { Text, View } from 'react-native';
import { styles } from '@/features/participation/ui';
import type { MapSceneProps } from './map-scene.types';

export default function MapScene(_props: MapSceneProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.text}>
        Peta interaktif tersedia pada aplikasi Android/iOS. Gunakan daftar laboratorium atau isi
        koordinat secara manual.
      </Text>
    </View>
  );
}
