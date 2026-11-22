import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';

import { BrandColors } from '@/constants/theme';
import { getAuthErrorMessage, logout } from '@/lib/auth';

export function LogoutButton({ inverted = false }: { inverted?: boolean }) {
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Keluar"
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={submit}
      style={({ pressed }) => [
        styles.button,
        inverted && styles.buttonInverted,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={inverted ? BrandColors.paper : BrandColors.ink} />
      ) : (
        <SymbolView
          name={{
            ios: 'rectangle.portrait.and.arrow.right',
            android: 'logout',
            web: 'logout',
          }}
          tintColor={inverted ? BrandColors.paper : BrandColors.ink}
          size={17}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 14,
    backgroundColor: BrandColors.paper,
    borderWidth: 1,
    borderColor: BrandColors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInverted: {
    marginRight: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  pressed: { opacity: 0.72 },
});
