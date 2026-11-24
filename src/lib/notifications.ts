import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export const NOTIFICATION_CHANNEL_ID = 'labsync-alerts';

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

type NotificationsType = typeof import('expo-notifications');

let _notifications: NotificationsType | null = null;
let _nativeModuleAvailable: boolean | null = null;

/**
 * Mengambil modul expo-notifications secara aman.
 * Menghindari crash 'Cannot find native module ExpoPushTokenManager' jika
 * aplikasi dijalankan pada build APK dev client lama yang belum di-rebuild.
 */
export function getNotificationsModule(): NotificationsType | null {
  if (_nativeModuleAvailable === false) return null;
  if (_notifications) return _notifications;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsType;
    _notifications = mod;
    _nativeModuleAvailable = true;

    // Konfigurasi agar notifikasi tampil saat aplikasi dibuka (foreground).
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    return mod;
  } catch (error) {
    console.warn(
      'Modul native expo-notifications belum terpasang di build APK saat ini. ' +
        'Aplikasi memerlukan development build baru (eas build atau expo run:android).',
      error,
    );
    _nativeModuleAvailable = false;
    return null;
  }
}

export function isNotificationSupported(): boolean {
  if (Platform.OS === 'web') return false;
  if (!Device.isDevice) return false;
  return getNotificationsModule() !== null;
}

export function getExpoProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    '1e63fc92-2602-488f-a8c9-617e2a104611'
  );
}

export async function setupNotificationChannel(): Promise<void> {
  const notifications = getNotificationsModule();
  if (!notifications) return;

  if (Platform.OS === 'android') {
    const { AndroidImportance } = notifications;
    await notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: 'Pemberitahuan LabSync',
      description: 'Pemberitahuan jadwal, sesi praktikum, dan keputusan izin',
      importance: AndroidImportance?.HIGH ?? 4,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#208AEF',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });
  }
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  const notifications = getNotificationsModule();
  if (!notifications) return 'unsupported';

  try {
    const settings = await notifications.getPermissionsAsync();
    const { IosAuthorizationStatus } = notifications;
    if (
      settings.granted ||
      (IosAuthorizationStatus && settings.ios?.status === IosAuthorizationStatus.PROVISIONAL)
    ) {
      return 'granted';
    }
    if (settings.canAskAgain) {
      return 'undetermined';
    }
    return 'denied';
  } catch {
    return 'unsupported';
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  const notifications = getNotificationsModule();
  if (!notifications) return 'unsupported';

  try {
    const current = await notifications.getPermissionsAsync();
    const { IosAuthorizationStatus } = notifications;
    if (
      current.granted ||
      (IosAuthorizationStatus && current.ios?.status === IosAuthorizationStatus.PROVISIONAL)
    ) {
      return 'granted';
    }
    const requested = await notifications.requestPermissionsAsync();
    if (
      requested.granted ||
      (IosAuthorizationStatus && requested.ios?.status === IosAuthorizationStatus.PROVISIONAL)
    ) {
      return 'granted';
    }
    return requested.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function registerPushToken(uid: string): Promise<string | null> {
  if (!uid) return null;
  const notifications = getNotificationsModule();
  if (!notifications) return null;

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return null;
  }

  await setupNotificationChannel();

  const projectId = getExpoProjectId();
  try {
    const tokenResult = await notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenResult.data;

    const { db } = await import('@/lib/firebase');
    const { doc, setDoc, serverTimestamp } = await import('@react-native-firebase/firestore');

    await setDoc(doc(db, 'pushTokens', uid), {
      token,
      platform: Platform.OS,
      enabled: true,
      updatedAt: serverTimestamp(),
    });

    return token;
  } catch (error) {
    console.warn('Gagal mendaftarkan push token perangkat:', error);
    return null;
  }
}

export async function unregisterPushToken(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const { db } = await import('@/lib/firebase');
    const { doc, deleteDoc } = await import('@react-native-firebase/firestore');
    await deleteDoc(doc(db, 'pushTokens', uid));
  } catch (error) {
    console.warn('Gagal menghapus push token saat logout:', error);
  }
}

export async function openNotificationSettings(): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
  } catch (error) {
    console.warn('Gagal membuka pengaturan notifikasi:', error);
  }
}
