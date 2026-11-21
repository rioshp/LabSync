import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthButton } from '@/components/auth-screen';
import { BrandColors } from '@/constants/theme';

export function DemoAccountPicker({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (account: { email: string; password: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!__DEV__ || process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST) return null;

  const accounts = [
    {
      label: 'Demo Praktikan',
      email: process.env.EXPO_PUBLIC_DEMO_PRAKTIKAN_EMAIL,
      password: process.env.EXPO_PUBLIC_DEMO_PRAKTIKAN_PASSWORD,
    },
    {
      label: 'Demo Asisten',
      email: process.env.EXPO_PUBLIC_DEMO_ASISTEN_EMAIL,
      password: process.env.EXPO_PUBLIC_DEMO_ASISTEN_PASSWORD,
    },
  ] as const;

  function choose(account: (typeof accounts)[number]) {
    if (!account.email || !account.password) return;
    setOpen(false);
    onSelect({ email: account.email, password: account.password });
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pilih akun demo"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={styles.trigger}
      >
        <Text style={styles.triggerText}>Demo</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View accessibilityViewIsModal style={styles.panel}>
            <Text accessibilityRole="header" style={styles.title}>
              Pilih akun demo
            </Text>
            {accounts.map((account) => (
              <AuthButton
                key={account.label}
                title={account.label}
                disabled={!account.email || !account.password}
                onPress={() => choose(account)}
              />
            ))}
            {accounts.some((account) => !account.email || !account.password) && (
              <Text style={styles.hint}>Preset akun demo belum lengkap.</Text>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.close}
            >
              <Text style={styles.triggerText}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minWidth: 64,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: BrandColors.softGreen,
  },
  triggerText: { color: BrandColors.forest, fontWeight: '700', fontSize: 14 },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  panel: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: BrandColors.paper,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: { color: BrandColors.forestDeep, fontSize: 20, fontWeight: '700' },
  hint: { color: BrandColors.forestSoft, fontSize: 13 },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
