import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton, AuthError } from '@/components/auth-screen';
import {
  BottomSheetModal,
  ConcentricArcOverlay,
  ScreenBackdrop,
} from '@/components/labsync-brand';
import { BrandColors } from '@/constants/theme';

const ARROW_BACK = require('../../../assets/images/arrow-back.svg');

export function Page({
  title,
  subtitle,
  detail = false,
  arc = false,
  clean = false,
  tabScreen = false,
  scrollEnabled = true,
  backdrop,
  headerRight,
  children,
}: {
  title?: string;
  subtitle?: string;
  detail?: boolean;
  arc?: boolean;
  clean?: boolean;
  tabScreen?: boolean;
  scrollEnabled?: boolean;
  backdrop?: 'waves' | 'topo' | 'blobs' | 'geometric';
  headerRight?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const resolvedBackdrop = backdrop ?? (clean ? 'blobs' : 'waves');
  return (
    <KeyboardAvoidingView
      style={[styles.screen, clean && styles.screenClean]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenBackdrop variant={resolvedBackdrop} />
      {arc ? <ConcentricArcOverlay /> : null}
      <ScrollView
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: detail ? insets.top + 14 : 10,
            paddingBottom: insets.bottom + (tabScreen ? 106 : 32),
          },
        ]}
      >
        {detail ? (
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kembali"
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/jadwal');
              }}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Image
                source={ARROW_BACK}
                contentFit="contain"
                accessible={false}
                style={styles.backIcon}
              />
            </Pressable>
            {headerRight ? <View>{headerRight}</View> : null}
          </View>
        ) : null}
        {title ? (
          <View style={styles.titleBlock}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.heading}>{title}</Text> : null}
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
      {loading ? <ActivityIndicator accessibilityLabel="Memuat data" color={BrandColors.ink} /> : null}
      {offline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            Data mungkin belum terbaru. Periksa koneksi internet.
          </Text>
        </View>
      ) : null}
      <AuthError message={error} />
      {error ? <AuthButton title="Coba lagi" onPress={retry} /> : null}
    </>
  );
}

export function Confirm({
  title,
  subtitle,
  danger = false,
  scrollEnabled = true,
  children,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  danger?: boolean;
  scrollEnabled?: boolean;
  children: ReactNode;
  onCancel: () => void;
}) {
  return (
    <BottomSheetModal
      visible
      title={title}
      subtitle={subtitle}
      danger={danger}
      scrollEnabled={scrollEnabled}
      onClose={onCancel}
    >
      {children}
    </BottomSheetModal>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BrandColors.pageBackground },
  screenClean: { backgroundColor: BrandColors.paper },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleBlock: { gap: 4 },
  title: { fontSize: 25, fontWeight: '800', letterSpacing: -0.5, color: BrandColors.ink },
  heading: { fontSize: 16, fontWeight: '800', color: BrandColors.ink },
  text: { fontSize: 14, lineHeight: 21, color: BrandColors.inkSoft },
  muted: { fontSize: 13, lineHeight: 19, color: BrandColors.muted },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BrandColors.paper,
    borderWidth: 1,
    borderColor: BrandColors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { width: 17, height: 17 },
  card: {
    backgroundColor: BrandColors.paper,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 16,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  badge: {
    color: BrandColors.paper,
    backgroundColor: BrandColors.ink,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  badgeSoft: {
    color: BrandColors.ink,
    backgroundColor: BrandColors.soft,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  badgeDanger: {
    color: BrandColors.ink,
    backgroundColor: BrandColors.paper,
    borderWidth: 1.5,
    borderColor: BrandColors.danger,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  offlineBanner: {
    backgroundColor: BrandColors.soft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BrandColors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  offlineText: {
    color: BrandColors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: { opacity: 0.78 },
});
