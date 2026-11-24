import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import {
  getNotificationPermissionStatus,
  getNotificationsModule,
  openNotificationSettings,
  registerPushToken,
  requestNotificationPermission,
  unregisterPushToken,
  type NotificationPermissionStatus,
} from '@/lib/notifications';

function navigateFromNotification(
  data: Record<string, unknown> | undefined,
  router: ReturnType<typeof useRouter>,
) {
  if (!data) return;

  if (typeof data.url === 'string' && data.url.startsWith('/')) {
    try {
      router.push(data.url as any);
      return;
    } catch (error) {
      console.warn('Gagal menavigasi ke url notifikasi:', data.url, error);
    }
  }

  const { type, classId, sessionId } = data;
  if (type === 'session_opened' || type === 'session_updated') {
    if (classId && sessionId) {
      router.push(`/praktikan/presensi?classId=${classId}&sessionId=${sessionId}` as any);
      return;
    }
  }

  if (type === 'session_cancelled') {
    router.push('/jadwal' as any);
    return;
  }

  if (type === 'permit_decided') {
    if (classId && sessionId) {
      router.push(`/praktikan/presensi?classId=${classId}&sessionId=${sessionId}` as any);
      return;
    }
    router.push('/praktikan/kelas' as any);
    return;
  }
}

export function useNotifications() {
  const { user, phase } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<NotificationPermissionStatus>('undetermined');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const previousUidRef = useRef<string | null>(null);
  const handledResponseIdRef = useRef<string | null>(null);

  const checkStatus = useCallback(async () => {
    const current = await getNotificationPermissionStatus();
    setStatus(current);
    return current;
  }, []);

  const requestPermission = useCallback(async () => {
    setLoading(true);
    try {
      const nextStatus = await requestNotificationPermission();
      setStatus(nextStatus);
      if (nextStatus === 'granted' && user?.uid) {
        const token = await registerPushToken(user.uid);
        setPushToken(token);
      }
      return nextStatus;
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  // Handle lifecycle registrasi dan deregistrasi push token saat login/logout.
  useEffect(() => {
    const currentUid = phase === 'active' && user ? user.uid : null;
    const previousUid = previousUidRef.current;

    // Pengguna baru saja logout.
    if (previousUid && !currentUid) {
      unregisterPushToken(previousUid);
      setPushToken(null);
    }

    // Pengguna baru saja login dengan profil aktif.
    if (currentUid && currentUid !== previousUid) {
      void (async () => {
        const perm = await checkStatus();
        if (perm === 'granted' || perm === 'undetermined') {
          const token = await registerPushToken(currentUid);
          setPushToken(token);
          await checkStatus();
        }
      })();
    }

    previousUidRef.current = currentUid;
  }, [checkStatus, phase, user]);

  // Listener interaksi notifikasi (saat foreground, background tap, dan cold start).
  useEffect(() => {
    const notifications = getNotificationsModule();
    if (!notifications) return;

    // 1. Tangani cold start (aplikasi dibuka dari kondisi mati lewat tap notifikasi).
    void notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && response.notification.request.identifier !== handledResponseIdRef.current) {
        handledResponseIdRef.current = response.notification.request.identifier;
        const data = response.notification.request.content.data as Record<string, unknown>;
        navigateFromNotification(data, router);
      }
    });

    // 2. Listener tap notifikasi saat aplikasi di background atau minimised.
    const responseSub = notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      navigateFromNotification(data, router);
    });

    // 3. Listener notifikasi diterima saat aplikasi di foreground.
    const receivedSub = notifications.addNotificationReceivedListener((_notification) => {
      // Notifikasi otomatis ditampilkan oleh setNotificationHandler di foreground.
    });

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, [router]);

  return {
    status,
    pushToken,
    loading,
    requestPermission,
    refreshStatus: checkStatus,
    openSettings: openNotificationSettings,
  };
}
