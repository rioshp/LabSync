import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton, AuthError } from '@/components/auth-screen';
import { BottomSheetModal } from '@/components/labsync-brand';
import { BrandColors } from '@/constants/theme';
import { getAuthErrorMessage, logout } from '@/lib/auth';

export function LogoutButton({ inverted = false }: { inverted?: boolean }) {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmLogout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await logout();
      setConfirmVisible(false);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Keluar"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={() => {
          setError(null);
          setConfirmVisible(true);
        }}
        style={({ pressed }) => [
          styles.button,
          inverted && styles.buttonInverted,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={inverted ? BrandColors.paper : BrandColors.ink} />
        ) : (
          <>
            <SymbolView
              name={{
                ios: 'rectangle.portrait.and.arrow.right',
                android: 'logout',
                web: 'logout',
              }}
              tintColor={inverted ? BrandColors.paper : BrandColors.ink}
              size={15}
            />
            <Text style={[styles.label, inverted && styles.labelInverted]}>Keluar</Text>
          </>
        )}
      </Pressable>

      <BottomSheetModal
        visible={confirmVisible}
        title="Keluar dari akun?"
        danger
        onClose={() => {
          if (!busy) setConfirmVisible(false);
        }}
      >
        <Text style={styles.description}>
          Kamu perlu masuk kembali dengan email atau Google untuk mengakses LabSync.
        </Text>
        <AuthError message={error} />
        <View style={styles.actions}>
          <View style={styles.actionCol}>
            <AuthButton
              title="Batal"
              variant="soft"
              disabled={busy}
              onPress={() => setConfirmVisible(false)}
            />
          </View>
          <View style={styles.actionCol}>
            <AuthButton
              title="Keluar"
              variant="danger"
              busy={busy}
              onPress={confirmLogout}
            />
          </View>
        </View>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginRight: 14,
    backgroundColor: BrandColors.paper,
    borderWidth: 1,
    borderColor: BrandColors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonInverted: {
    marginRight: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  label: {
    color: BrandColors.ink,
    fontSize: 12.5,
    fontWeight: '700',
  },
  labelInverted: {
    color: BrandColors.paper,
  },
  description: {
    color: BrandColors.muted,
    fontSize: 13.5,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionCol: {
    flex: 1,
  },
  pressed: { opacity: 0.72 },
});
