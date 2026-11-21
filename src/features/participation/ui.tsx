import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton, AuthError } from '@/components/auth-screen';
import { BrandColors } from '@/constants/theme';

export function Page({
  title,
  detail = false,
  children,
}: {
  title?: string;
  detail?: boolean;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 24 },
        detail && { paddingTop: insets.top + 20 },
      ]}
    >
      {detail && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/jadwal');
          }}
          style={styles.back}
        >
          <Text style={styles.link}>‹ Kembali</Text>
        </Pressable>
      )}
      {title && (
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      )}
      {children}
    </ScrollView>
  );
}

export function Card({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <View style={styles.card}>
      {title && <Text style={styles.heading}>{title}</Text>}
      {children}
    </View>
  );
}

export function Feedback({
  loading,
  error,
  offline,
  retry,
}: {
  loading: boolean;
  error: string | null;
  offline: boolean;
  retry: () => void;
}) {
  return (
    <>
      {loading && <ActivityIndicator accessibilityLabel="Memuat data" color={BrandColors.forest} />}
      {offline && (
        <Text style={styles.text}>Data mungkin belum terbaru. Periksa koneksi internet.</Text>
      )}
      <AuthError message={error} />
      {error && <AuthButton title="Coba lagi" onPress={retry} />}
    </>
  );
}

export function Confirm({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.modal}>
          <Text accessibilityRole="header" style={styles.heading}>
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BrandColors.pageBackground },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 20, gap: 16 },
  title: { fontSize: 30, fontWeight: '700', color: BrandColors.forestDeep },
  heading: { fontSize: 18, fontWeight: '700', color: BrandColors.forestDeep },
  text: { fontSize: 15, lineHeight: 23, color: BrandColors.ink },
  link: { fontSize: 16, fontWeight: '700', color: BrandColors.forest },
  back: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  card: {
    backgroundColor: BrandColors.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 16,
    gap: 10,
  },
  badge: {
    color: BrandColors.forest,
    backgroundColor: BrandColors.softGreen,
    padding: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    fontWeight: '700',
  },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.42)' },
  modal: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: 20,
    borderRadius: 16,
    backgroundColor: BrandColors.paper,
    gap: 12,
  },
});
