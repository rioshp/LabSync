import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';

export function AuthScreen({ title, description, children, intro = false }: {
  title: string;
  description: string;
  children: ReactNode;
  intro?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [showIntro, setShowIntro] = useState(intro);
  const [introProgress] = useState(() => new Animated.Value(intro ? 0 : 1));

  useEffect(() => {
    if (!intro) return;
    introProgress.setValue(0);
    const animation = Animated.timing(introProgress, {
      toValue: 1,
      duration: 950,
      delay: 550,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setShowIntro(false);
    });
    return () => animation.stop();
  }, [intro, introProgress]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View
        style={[styles.page, { opacity: introProgress }]}
        pointerEvents={showIntro ? 'none' : 'auto'}
        accessibilityElementsHidden={showIntro}
        importantForAccessibility={showIntro ? 'no-hide-descendants' : 'auto'}>
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.background}>
          <View style={styles.backgroundTop} />
          <View style={styles.backgroundSide} />
          <View style={styles.backgroundBottom} />
          <View style={styles.backgroundCorner} />
          <View style={styles.backgroundMiddle} />
          <View style={styles.backgroundTopStep} />
          <View style={styles.backgroundTopTile} />
          <View style={styles.backgroundLeftTile} />
          <View style={styles.backgroundBottomStep} />
          <View style={styles.backgroundBottomTile} />
        </View>
        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 78, paddingBottom: insets.bottom + 32 },
          ]}>
          <View style={styles.hero}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
          {children}
        </ScrollView>
      </Animated.View>
      {showIntro && (
        <Animated.View
          style={[
            styles.introScreen,
            { opacity: introProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
          ]}
          accessibilityLabel="Memuat presensi praktikum"
          accessibilityRole="progressbar">
          <View style={styles.introMark}>
            {[0, 1, 2, 3].map((block) => (
              <Animated.View
                key={block}
                style={[
                  styles.introBlock,
                  block === 1 && styles.introBlockLight,
                  block === 2 && styles.introBlockSoft,
                  {
                    transform: [
                      {
                        translateX: introProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, block % 2 === 0 ? -52 : 52],
                        }),
                      },
                      {
                        translateY: introProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, block < 2 ? -52 : 52],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

export function AuthField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={BrandColors.muted} {...props} style={styles.input} />
    </View>
  );
}

export function AuthButton({ title, onPress, busy = false, disabled = false }: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title}
      accessibilityState={{ disabled: busy || disabled, busy }} disabled={busy || disabled}
      onPress={onPress} style={({ pressed }) => [
        styles.submit, (busy || disabled) && styles.disabledSubmit, pressed && styles.pressed,
      ]}>
      {busy ? <ActivityIndicator color={BrandColors.paper} /> : <Text style={styles.submitText}>{title}</Text>}
    </Pressable>
  );
}

export function AuthError({ message }: { message: string | null }) {
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BrandColors.paper,
  },
  page: {
    flex: 1,
  },
  introScreen: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.paper,
  },
  introMark: {
    width: 100,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  introBlock: {
    width: 46,
    height: 46,
    backgroundColor: BrandColors.forest,
  },
  introBlockLight: {
    backgroundColor: BrandColors.sageLight,
  },
  introBlockSoft: {
    backgroundColor: BrandColors.forestSoft,
  },
  background: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  backgroundTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 112,
    height: 168,
    backgroundColor: BrandColors.sageLight,
    opacity: 0.85,
  },
  backgroundSide: {
    position: 'absolute',
    top: 176,
    right: 0,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forestSoft,
    opacity: 0.12,
  },
  backgroundBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 112,
    height: 168,
    backgroundColor: BrandColors.sageLight,
    opacity: 0.75,
  },
  backgroundCorner: {
    position: 'absolute',
    bottom: 176,
    left: 0,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forestSoft,
    opacity: 0.12,
  },
  backgroundMiddle: {
    position: 'absolute',
    top: '48%',
    right: 0,
    width: 48,
    height: 104,
    backgroundColor: BrandColors.sageLight,
    opacity: 0.7,
  },
  backgroundTopStep: {
    position: 'absolute',
    top: 0,
    right: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forest,
    opacity: 0.1,
  },
  backgroundTopTile: {
    position: 'absolute',
    top: 56,
    right: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.softGreen,
    opacity: 0.85,
  },
  backgroundLeftTile: {
    position: 'absolute',
    top: '47%',
    left: 0,
    width: 32,
    height: 48,
    backgroundColor: BrandColors.sage,
    opacity: 0.18,
  },
  backgroundBottomStep: {
    position: 'absolute',
    bottom: 0,
    left: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.forest,
    opacity: 0.1,
  },
  backgroundBottomTile: {
    position: 'absolute',
    bottom: 56,
    left: 120,
    width: 48,
    height: 48,
    backgroundColor: BrandColors.softGreen,
    opacity: 0.85,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 24,
    gap: 28,
  },
  hero: {
    gap: 16,
    paddingBottom: 8,
  },
  title: {
    color: BrandColors.forestDeep,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
  },
  description: {
    color: BrandColors.forestSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  submit: {
    minHeight: 56,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.forest,
  },
  disabledSubmit: {
    backgroundColor: BrandColors.muted,
  },
  submitText: {
    color: BrandColors.paper,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
  form: {
    gap: 18,
  },
  field: {
    gap: 12,
  },
  label: {
    color: BrandColors.forestDeep,
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    minHeight: 56,
    padding: 14,
    borderWidth: 2,
    borderRadius: 14,
    borderColor: BrandColors.line,
    backgroundColor: BrandColors.paper,
    color: BrandColors.ink,
    fontSize: 16,
  },
  link: {
    padding: 12,
    color: BrandColors.forest,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  error: {
    color: BrandColors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});

export const authStyles = {
  form: styles.form,
  link: styles.link,
  label: styles.label,
};
