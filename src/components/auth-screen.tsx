import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
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

import { DiagonalHatchOverlay, LabSyncLockup } from '@/components/labsync-brand';
import { BrandColors } from '@/constants/theme';

const AUTH_WAVE = require('../../assets/images/auth-wave.svg');
const DARK_CONTOUR = require('../../assets/images/dark-contour.svg');
const ARROW_BACK = require('../../assets/images/arrow-back.svg');

export type FieldIconName = 'mail' | 'lock' | 'user' | 'id' | 'search' | 'pin' | 'calendar' | 'clock';

const FIELD_ICONS: Record<FieldIconName, { ios: SFSymbol; android: string; web: string }> = {
  mail: { ios: 'envelope', android: 'mail_outline', web: 'mail_outline' },
  lock: { ios: 'lock', android: 'lock_outline', web: 'lock_outline' },
  user: { ios: 'person', android: 'person_outline', web: 'person_outline' },
  id: { ios: 'creditcard', android: 'badge', web: 'badge' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
};

export function AuthScreen({
  title,
  description,
  children,
  header = 'clean',
  stepLabel,
  dangerBadge = false,
  onBack,
  showHatch = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  header?: 'wave' | 'clean';
  stepLabel?: string;
  dangerBadge?: boolean;
  onBack?: () => void;
  showHatch?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const isWave = header === 'wave';

  return (
    <KeyboardAvoidingView
      style={[styles.screen, isWave ? styles.screenSoft : styles.screenClean]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={isWave ? 'light' : 'dark'} />
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        {isWave ? (
          <View style={styles.waveWrapper}>
            <View style={[styles.waveHeader, { paddingTop: insets.top + 14 }]}>
              <Image
                source={DARK_CONTOUR}
                contentFit="contain"
                pointerEvents="none"
                accessible={false}
                style={styles.contourImage}
              />
              <View style={styles.waveInner}>
                <LabSyncLockup size={28} inverted />
                <View style={styles.waveHero}>
                  <Text accessibilityRole="header" style={styles.waveTitle}>
                    {title}
                  </Text>
                  {description ? <Text style={styles.waveDescription}>{description}</Text> : null}
                </View>
              </View>
            </View>
            <Image
              source={AUTH_WAVE}
              contentFit="fill"
              pointerEvents="none"
              accessible={false}
              style={styles.waveSvg}
            />
          </View>
        ) : (
          <View style={[styles.cleanHeader, { paddingTop: insets.top + 14 }]}>
            <View style={styles.cleanTopRow}>
              {onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Kembali"
                  onPress={onBack}
                  style={({ pressed }) => [styles.backCircle, pressed && styles.pressed]}
                >
                  <Image
                    source={ARROW_BACK}
                    contentFit="contain"
                    accessible={false}
                    style={styles.backIcon}
                  />
                </Pressable>
              ) : (
                <LabSyncLockup size={26} />
              )}
              {showHatch ? (
                <DiagonalHatchOverlay inline size={42} />
              ) : stepLabel ? (
                <Text style={styles.stepLabelText}>{stepLabel}</Text>
              ) : null}
            </View>
            {dangerBadge ? (
              <View style={styles.dangerBadge} accessible={false}>
                <SymbolView
                  name={{
                    ios: 'exclamationmark.triangle',
                    android: 'warning_amber',
                    web: 'warning_amber',
                  }}
                  size={22}
                  tintColor={BrandColors.danger}
                />
              </View>
            ) : null}
            <View style={styles.cleanHero}>
              <Text accessibilityRole="header" style={styles.cleanTitle}>
                {title}
              </Text>
              {description ? <Text style={styles.cleanDescription}>{description}</Text> : null}
            </View>
          </View>
        )}

        <View style={[styles.body, isWave && styles.bodyWave]}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthField({
  label,
  labelRight,
  icon,
  passwordToggle = false,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label: string;
  labelRight?: ReactNode;
  icon?: FieldIconName;
  passwordToggle?: boolean;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const visibilityLabel = passwordVisible ? 'Sembunyikan password' : 'Tampilkan password';

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {labelRight}
      </View>
      <View style={styles.inputWrap}>
        {icon ? (
          <View pointerEvents="none" accessible={false} style={styles.leadingIcon}>
            <SymbolView
              name={FIELD_ICONS[icon] as never}
              tintColor={focused ? BrandColors.ink : BrandColors.muted}
              size={17}
            />
          </View>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={BrandColors.muted}
          {...props}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          secureTextEntry={passwordToggle ? !passwordVisible : secureTextEntry}
          style={[
            styles.input,
            icon && styles.inputWithIcon,
            focused && styles.inputFocused,
            passwordToggle && styles.inputWithToggle,
            style,
          ]}
        />
        {passwordToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visibilityLabel}
            accessibilityState={{ disabled: props.editable === false }}
            disabled={props.editable === false}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={styles.passwordToggle}
          >
            <SymbolView
              name={{
                ios: passwordVisible ? 'eye.slash' : 'eye',
                android: passwordVisible ? 'visibility_off' : 'visibility',
                web: passwordVisible ? 'visibility_off' : 'visibility',
              }}
              tintColor={BrandColors.muted}
              size={19}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AuthButton({
  title,
  onPress,
  busy = false,
  disabled = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'danger' | 'soft' | 'google';
}) {
  const isGoogle = variant === 'google';
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isOutline = variant === 'outline';
  const isSoft = variant === 'soft';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.submit,
        isOutline && styles.outlineButton,
        isDanger && styles.dangerButton,
        isSoft && styles.softButton,
        isGoogle && styles.googleButton,
        (busy || disabled) && (isPrimary ? styles.disabledSubmit : styles.disabledSecondary),
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? BrandColors.paper : BrandColors.ink} />
      ) : (
        <View style={styles.buttonRow}>
          {isGoogle ? (
            <Image
              source={require('../../assets/images/google-logo.svg')}
              accessible={false}
              style={styles.googleLogo}
            />
          ) : null}
          {isDanger ? (
            <SymbolView
              name={{
                ios: 'exclamationmark.triangle',
                android: 'warning_amber',
                web: 'warning_amber',
              }}
              size={15}
              tintColor={BrandColors.danger}
            />
          ) : null}
          <Text
            style={[
              styles.submitText,
              !isPrimary && styles.darkButtonText,
              isGoogle && styles.googleButtonText,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function AuthError({ message }: { message: string | null }) {
  return message ? (
    <View style={styles.errorBox}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
        {message}
      </Text>
    </View>
  ) : null;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenSoft: {
    backgroundColor: BrandColors.pageBackground,
  },
  screenClean: {
    backgroundColor: BrandColors.paper,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  waveWrapper: {
    width: '100%',
  },
  waveHeader: {
    backgroundColor: BrandColors.ink,
    paddingHorizontal: 20,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  contourImage: {
    position: 'absolute',
    top: -48,
    right: -56,
    width: 240,
    height: 240,
  },
  waveSvg: {
    width: '100%',
    height: 30,
    marginTop: -1,
  },
  waveInner: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: 16,
  },
  waveHero: {
    gap: 6,
  },
  waveTitle: {
    color: BrandColors.paper,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  waveDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    lineHeight: 19,
  },
  cleanHeader: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 20,
  },
  cleanTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BrandColors.paper,
    borderWidth: 1,
    borderColor: BrandColors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 17,
    height: 17,
  },
  stepLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: BrandColors.muted,
    letterSpacing: 0.6,
  },
  dangerBadge: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: BrandColors.danger,
    backgroundColor: BrandColors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanHero: {
    gap: 6,
  },
  cleanTitle: {
    color: BrandColors.ink,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  cleanDescription: {
    color: BrandColors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  body: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 13,
  },
  bodyWave: {
    marginTop: 6,
  },
  submit: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.ink,
    borderWidth: 1.5,
    borderColor: BrandColors.ink,
  },
  outlineButton: {
    backgroundColor: BrandColors.paper,
    borderColor: BrandColors.ink,
  },
  dangerButton: {
    backgroundColor: BrandColors.paper,
    borderColor: BrandColors.danger,
  },
  softButton: {
    backgroundColor: BrandColors.soft,
    borderColor: BrandColors.line,
  },
  googleButton: {
    backgroundColor: BrandColors.paper,
    borderColor: BrandColors.inputBorder,
  },
  disabledSubmit: {
    backgroundColor: BrandColors.neutralMid,
    borderColor: BrandColors.neutralMid,
  },
  disabledSecondary: {
    opacity: 0.55,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  googleLogo: {
    width: 17,
    height: 17,
  },
  submitText: {
    color: BrandColors.paper,
    fontSize: 14,
    fontWeight: '800',
  },
  darkButtonText: {
    color: BrandColors.ink,
  },
  googleButtonText: {
    color: BrandColors.ink,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
  form: {
    gap: 12,
  },
  field: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    color: BrandColors.ink,
    fontSize: 12.5,
    fontWeight: '700',
  },
  inputWrap: {
    justifyContent: 'center',
  },
  leadingIcon: {
    position: 'absolute',
    start: 13,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWithIcon: {
    paddingStart: 40,
  },
  inputWithToggle: {
    paddingEnd: 46,
  },
  passwordToggle: {
    position: 'absolute',
    end: 3,
    minWidth: 42,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderRadius: 14,
    borderColor: BrandColors.inputBorder,
    backgroundColor: BrandColors.paper,
    color: BrandColors.ink,
    fontSize: 14,
  },
  inputFocused: {
    borderColor: BrandColors.ink,
  },
  link: {
    padding: 10,
    color: BrandColors.ink,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BrandColors.danger,
    backgroundColor: BrandColors.dangerSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: {
    color: BrandColors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});

export const authStyles = {
  form: styles.form,
  link: styles.link,
  label: styles.label,
};
