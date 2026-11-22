import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';

const LOGO_DARK = require('../../assets/images/logo-graph-dark.svg');
const LOGO_LIGHT = require('../../assets/images/logo-graph-light.svg');
const CONCENTRIC_ARCS = require('../../assets/images/concentric-arcs.svg');

/** Logo CS Graph Cycle (Opsi 07) — 3 simpul segitiga terhubung, dirender dari aset SVG lokal. */
export function CsGraphLogo({ size = 30, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <Image
      source={inverted ? LOGO_LIGHT : LOGO_DARK}
      contentFit="contain"
      accessible={false}
      style={{ width: size, height: size }}
    />
  );
}

/** Lockup logo + wordmark LabSync. */
export function LabSyncLockup({ size = 28, inverted = false }: { size?: number; inverted?: boolean }) {
  const fontSize = Math.round(size * 0.6);
  const color = inverted ? BrandColors.paper : BrandColors.ink;
  return (
    <View style={styles.lockup}>
      <CsGraphLogo size={size} inverted={inverted} />
      <Text style={[styles.lockupText, { fontSize, color }]}>
        Lab<Text style={styles.lockupLight}>Sync</Text>
      </Text>
    </View>
  );
}

/** Motif Halftone Dot Matrix untuk sudut kanan kartu hero gelap Jadwal. */
export function DotMatrixOverlay({ light = false }: { light?: boolean }) {
  const color = light ? 'rgba(24, 24, 27, 0.14)' : 'rgba(255, 255, 255, 0.22)';
  return (
    <View pointerEvents="none" accessible={false} style={styles.dotMatrix}>
      {[0, 1, 2, 3, 4, 5, 6].map((row) => (
        <View key={row} style={styles.dotRow}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((col) => (
            <View key={col} style={[styles.dot, { backgroundColor: color }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Motif Diagonal Architectural Hatch untuk sudut kartu aktif, badge Reset, atau bar AI Negatif. */
export function DiagonalHatchOverlay({
  tone = 'ink',
  size = 64,
  inline = false,
}: {
  tone?: 'ink' | 'danger';
  size?: number;
  inline?: boolean;
}) {
  const stripeColor =
    tone === 'danger' ? 'rgba(220, 38, 38, 0.16)' : 'rgba(24, 24, 27, 0.10)';
  const count = Math.max(8, Math.ceil(size / 5));
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={[
        inline ? styles.hatchInline : styles.hatchWrap,
        { width: size, height: size },
      ]}
    >
      <View style={[styles.hatchInner, { width: size * 2, height: size * 2 }]}>
        {Array.from({ length: count }).map((_, idx) => (
          <View key={idx} style={[styles.hatchStripe, { backgroundColor: stripeColor }]} />
        ))}
      </View>
    </View>
  );
}

/** Motif Concentric Arcs di pojok kanan atas layar Daftar Izin & Rekap Kelas. */
export function ConcentricArcOverlay() {
  return (
    <Image
      source={CONCENTRIC_ARCS}
      contentFit="contain"
      pointerEvents="none"
      accessible={false}
      style={styles.arcImage}
    />
  );
}

/** Bottom Sheet Modal bergaya Monochrome Student Bento v3. */
export function BottomSheetModal({
  visible,
  title,
  subtitle,
  danger = false,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  danger?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup modal"
          onPress={onClose}
          style={styles.sheetDismissArea}
        />
        <View style={[styles.sheetCard, { paddingBottom: Math.max(22, insets.bottom + 14) }]}>
          <View style={[styles.sheetHandle, danger && styles.sheetHandleDanger]} />
          <View style={styles.sheetHeaderRow}>
            {danger ? (
              <View style={styles.dangerIconBox} accessible={false}>
                <SymbolView
                  name={{
                    ios: 'exclamationmark.triangle',
                    android: 'warning_amber',
                    web: 'warning_amber',
                  }}
                  size={17}
                  tintColor={BrandColors.danger}
                />
              </View>
            ) : null}
            <View style={styles.sheetTitleWrap}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
            </View>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetBody}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockupText: {
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  lockupLight: {
    fontWeight: '500',
  },
  dotMatrix: {
    position: 'absolute',
    top: 10,
    right: 10,
    gap: 7,
    opacity: 0.8,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 7,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  hatchWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    overflow: 'hidden',
    borderBottomLeftRadius: 16,
  },
  hatchInline: {
    overflow: 'hidden',
    borderRadius: 10,
  },
  hatchInner: {
    position: 'absolute',
    top: -32,
    left: -32,
    gap: 6,
    transform: [{ rotate: '-45deg' }],
  },
  hatchStripe: {
    width: '100%',
    height: 1.5,
  },
  arcImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 190,
    height: 190,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 24, 27, 0.52)',
    justifyContent: 'flex-end',
  },
  sheetDismissArea: {
    flex: 1,
  },
  sheetCard: {
    backgroundColor: BrandColors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '88%',
    gap: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: BrandColors.inputBorder,
    alignSelf: 'center',
    marginBottom: 2,
  },
  sheetHandleDanger: {
    backgroundColor: BrandColors.danger,
    opacity: 0.75,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dangerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: BrandColors.danger,
    backgroundColor: BrandColors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitleWrap: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    color: BrandColors.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    color: BrandColors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  sheetBody: {
    gap: 12,
  },
});
