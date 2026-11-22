import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';

const LOGO_DARK = require('../../assets/images/logo-graph-dark.svg');
const LOGO_LIGHT = require('../../assets/images/logo-graph-light.svg');
const CONCENTRIC_ARCS = require('../../assets/images/concentric-arcs.svg');
const DARK_CONTOUR = require('../../assets/images/dark-contour.svg');
const DARK_GRADIENT = require('../../assets/images/dark-gradient.svg');
const BG_WAVES = require('../../assets/images/bg-paper-waves.jpg');
const BG_TOPO = require('../../assets/images/bg-topo-lines.jpg');
const BG_BLOBS = require('../../assets/images/bg-ink-blobs.jpg');
const BG_GEO = require('../../assets/images/bg-geometric.jpg');

const BACKDROP_SOURCES = {
  waves: { source: BG_WAVES, opacity: 0.48 },
  topo: { source: BG_TOPO, opacity: 0.13 },
  blobs: { source: BG_BLOBS, opacity: 0.1 },
  geometric: { source: BG_GEO, opacity: 0.08 },
} as const;

/** Latar ambient monokrom lembut per area layar (paper waves, topographic contour, ink blobs). */
export function ScreenBackdrop({ variant }: { variant: keyof typeof BACKDROP_SOURCES }) {
  const { source, opacity } = BACKDROP_SOURCES[variant];
  return (
    <Image
      source={source}
      contentFit="cover"
      contentPosition="top"
      pointerEvents="none"
      accessible={false}
      style={[StyleSheet.absoluteFill, { opacity }]}
    />
  );
}

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

/** Motif Halftone Dot Matrix untuk sisi kanan kartu hero gelap Jadwal (~44% lebar kartu). */
export function DotMatrixOverlay({ light = false }: { light?: boolean }) {
  const color = light ? 'rgba(24, 24, 27, 0.14)' : 'rgba(255, 255, 255, 0.22)';
  return (
    <View pointerEvents="none" accessible={false} style={styles.dotMatrix}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((row) => (
        <View key={row} style={styles.dotRow}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((col) => (
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

/** Gradient monokrom gelap halus (#2C2C2A -> #141414) untuk header gelap dan kartu hero. */
export function DarkGradientOverlay() {
  return (
    <Image
      source={DARK_GRADIENT}
      contentFit="fill"
      pointerEvents="none"
      accessible={false}
      style={StyleSheet.absoluteFill}
    />
  );
}

/** Motif garis kontur organik halus untuk header gelap (Profil, Detail Kelas, Detail Sesi, Rekap). */
export function DarkContourOverlay() {
  return (
    <Image
      source={DARK_CONTOUR}
      contentFit="contain"
      pointerEvents="none"
      accessible={false}
      style={styles.darkContour}
    />
  );
}

/** Aksen titik-titik halus di pojok kanan bawah kartu kelas aktif pertama (aman dari badge atas). */
export function CornerDotAccent() {
  return (
    <View pointerEvents="none" accessible={false} style={styles.cornerDots}>
      {[0, 1, 2, 3].map((row) => (
        <View key={row} style={styles.cornerDotRow}>
          {[0, 1, 2, 3, 4].map((col) => (
            <View key={col} style={styles.cornerDot} />
          ))}
        </View>
      ))}
    </View>
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
    top: 0,
    bottom: 0,
    right: 0,
    width: '44%',
    paddingRight: 10,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 9,
    overflow: 'hidden',
    opacity: 0.85,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 9,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
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
  darkContour: {
    position: 'absolute',
    top: -54,
    right: -54,
    width: 220,
    height: 220,
    opacity: 0.45,
  },
  cornerDots: {
    position: 'absolute',
    bottom: 12,
    right: 14,
    gap: 6,
    opacity: 0.65,
  },
  cornerDotRow: {
    flexDirection: 'row',
    gap: 6,
  },
  cornerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: BrandColors.inputBorder,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 24, 27, 0.54)',
    justifyContent: 'flex-end',
  },
  sheetDismissArea: {
    flex: 1,
  },
  sheetCard: {
    backgroundColor: BrandColors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(24, 24, 27, 0.06)',
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '88%',
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  sheetHandle: {
    width: 42,
    height: 4.5,
    borderRadius: 999,
    backgroundColor: BrandColors.inputBorder,
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetHandleDanger: {
    backgroundColor: BrandColors.danger,
    opacity: 0.78,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.line,
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
