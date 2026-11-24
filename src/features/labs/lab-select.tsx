import { Pressable, Text, View } from 'react-native';
import { Feedback, styles } from '@/features/participation/ui';
import type { Lab } from './types';
import { useLabs } from './useLabs';

export function LabSelect({
  labId,
  onChange,
}: {
  labId: string;
  onChange: (value: { labId: string; room: string }) => void;
}) {
  const labs = useLabs();
  const selected = labs.items.find((lab) => lab.id === labId);
  function select(lab: Lab) {
    onChange({ labId: lab.id, room: lab.name });
  }
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.heading}>Laboratorium</Text>
      <Feedback {...labs} />
      {labs.items.map((lab) => (
        <Pressable
          key={lab.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: lab.id === labId }}
          style={styles.card}
          onPress={() => select(lab)}
        >
          <Text style={styles.text}>
            {lab.id === labId ? '●' : '○'} {lab.name}
          </Text>
          {lab.description ? <Text style={styles.muted}>{lab.description}</Text> : null}
        </Pressable>
      ))}
      {!labs.loading && !labs.error && !labs.items.length ? (
        <Text style={styles.muted}>Belum ada lab aktif. Tambahkan melalui Kelola Lab.</Text>
      ) : null}
      {labId && !selected && !labs.loading ? (
        <Text style={styles.muted}>Lab sebelumnya tidak aktif. Pilih laboratorium lain.</Text>
      ) : null}
    </View>
  );
}
