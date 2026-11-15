import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';

import { BrandColors } from '@/constants/theme';
import { getAuthErrorMessage, logout } from '@/lib/auth';

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
    } catch (error) {
      Alert.alert('Gagal keluar', getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Keluar"
      accessibilityState={{ disabled: busy, busy }} disabled={busy}
      onPress={submit} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={BrandColors.forest} /> : <Text accessible={false} style={styles.icon}>↪</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 48, minHeight: 44, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 28, color: BrandColors.forest, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
