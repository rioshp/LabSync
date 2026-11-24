import { NOTIFICATION_CHANNEL_ID } from './notifications';

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Mengirim array pesan push notification ke Expo Push API.
 * Mendukung batching hingga 100 pesan per request sesuai ketentuan Expo.
 */
export async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (!messages || messages.length === 0) return;

  const validMessages = messages.filter(
    (msg) => typeof msg.to === 'string' && msg.to.startsWith('ExponentPushToken'),
  );

  if (validMessages.length === 0) return;

  // Bagi menjadi beberapa batch dengan ukuran maksimal 100 per batch.
  const batchSize = 100;
  for (let i = 0; i < validMessages.length; i += batchSize) {
    const batch = validMessages.slice(i, i + batchSize);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.warn(`Expo Push API response status: ${response.status}`);
      }
    } catch (error) {
      console.warn('Gagal mengirim batch push notification:', error);
    }
  }
}

/**
 * Mengambil seluruh push token aktif milik praktikan yang terdaftar pada kelas tertentu.
 */
async function getActiveStudentPushTokens(classId: string): Promise<string[]> {
  try {
    const { db } = await import('@/lib/firebase');
    const { collection, getDocs, query, where, doc, getDoc } = await import(
      '@react-native-firebase/firestore'
    );

    const enrollmentsSnap = await getDocs(
      query(
        collection(db, 'enrollments'),
        where('classId', '==', classId),
        where('status', '==', 'active'),
      ),
    );

    const studentUids: string[] = [];
    enrollmentsSnap.forEach((d) => {
      const data = d.data();
      if (data?.studentUid) {
        studentUids.push(data.studentUid);
      }
    });

    if (studentUids.length === 0) return [];

    const tokens: string[] = [];
    await Promise.all(
      studentUids.map(async (uid) => {
        try {
          const tokenSnap = await getDoc(doc(db, 'pushTokens', uid));
          if (tokenSnap.exists()) {
            const tokenData = tokenSnap.data();
            if (tokenData?.enabled && typeof tokenData?.token === 'string') {
              tokens.push(tokenData.token);
            }
          }
        } catch {
          // Abaikan kegagalan baca token individu
        }
      }),
    );

    return Array.from(new Set(tokens));
  } catch (error) {
    console.warn('Gagal mengambil push token mahasiswa kelas:', error);
    return [];
  }
}

/**
 * Trigger 1: Notifikasi saat sesi praktikum dibuka (openSession).
 */
export async function notifySessionOpened(params: {
  classId: string;
  sessionId: string;
}): Promise<void> {
  const { classId, sessionId } = params;
  try {
    const { db } = await import('@/lib/firebase');
    const { doc, getDoc } = await import('@react-native-firebase/firestore');

    const [classSnap, sessionSnap] = await Promise.all([
      getDoc(doc(db, 'classes', classId)),
      getDoc(doc(db, 'classes', classId, 'sessions', sessionId)),
    ]);

    const classData = classSnap.data();
    const sessionData = sessionSnap.data();
    if (!classData || !sessionData) return;

    const tokens = await getActiveStudentPushTokens(classId);
    if (tokens.length === 0) return;

    const moduleTitle = sessionData.moduleTitle ?? 'Praktikum';
    const className = classData.name ?? 'Kelas';
    const title = 'Sesi Praktikum Dibuka';
    const body = `Sesi ${moduleTitle} (${className}) telah dibuka. Segera buka aplikasi untuk melakukan presensi.`;

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: NOTIFICATION_CHANNEL_ID,
      priority: 'high',
      data: {
        type: 'session_opened',
        url: `/praktikan/presensi?classId=${classId}&sessionId=${sessionId}`,
        classId,
        sessionId,
      },
    }));

    await sendExpoPushNotifications(messages);
  } catch (error) {
    console.warn('Gagal memproses notifikasi sesi dibuka:', error);
  }
}

/**
 * Trigger 2: Notifikasi saat jadwal praktikum diubah atau dibatalkan (updateSession / cancelSession).
 */
export async function notifySessionUpdated(params: {
  classId: string;
  sessionId: string;
  action: 'updateSession' | 'cancelSession';
}): Promise<void> {
  const { classId, sessionId, action } = params;
  try {
    const { db } = await import('@/lib/firebase');
    const { doc, getDoc } = await import('@react-native-firebase/firestore');

    const [classSnap, sessionSnap] = await Promise.all([
      getDoc(doc(db, 'classes', classId)),
      getDoc(doc(db, 'classes', classId, 'sessions', sessionId)),
    ]);

    const classData = classSnap.data();
    const sessionData = sessionSnap.data();
    if (!classData || !sessionData) return;

    const tokens = await getActiveStudentPushTokens(classId);
    if (tokens.length === 0) return;

    const moduleTitle = sessionData.moduleTitle ?? 'Praktikum';
    const className = classData.name ?? 'Kelas';
    const isCancelled = action === 'cancelSession';

    const title = isCancelled ? 'Sesi Praktikum Dibatalkan' : 'Jadwal Praktikum Diperbarui';
    const body = isCancelled
      ? `Sesi ${moduleTitle} (${className}) telah dibatalkan oleh asisten.`
      : `Jadwal sesi ${moduleTitle} (${className}) telah diperbarui oleh asisten. Silakan periksa jadwal terbaru.`;

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: NOTIFICATION_CHANNEL_ID,
      priority: 'high',
      data: {
        type: isCancelled ? 'session_cancelled' : 'session_updated',
        url: isCancelled
          ? '/jadwal'
          : `/praktikan/presensi?classId=${classId}&sessionId=${sessionId}`,
        classId,
        sessionId,
      },
    }));

    await sendExpoPushNotifications(messages);
  } catch (error) {
    console.warn('Gagal memproses notifikasi perubahan/pembatalan sesi:', error);
  }
}

/**
 * Trigger 3: Notifikasi saat izin diputuskan oleh asisten (decidePermit).
 */
export async function notifyPermitDecided(params: {
  permitId: string;
  decision: 'approved' | 'rejected';
  decisionNote?: string;
}): Promise<void> {
  const { permitId, decision, decisionNote } = params;
  try {
    const { db } = await import('@/lib/firebase');
    const { doc, getDoc } = await import('@react-native-firebase/firestore');

    const permitSnap = await getDoc(doc(db, 'permits', permitId));
    const permit = permitSnap.data();
    if (!permit || !permit.studentUid) return;

    const tokenSnap = await getDoc(doc(db, 'pushTokens', permit.studentUid));
    if (!tokenSnap.exists()) return;

    const tokenData = tokenSnap.data();
    if (!tokenData?.enabled || typeof tokenData?.token !== 'string') return;

    const moduleTitle = permit.sessionSnapshot?.moduleTitle ?? 'Praktikum';
    const isApproved = decision === 'approved';
    const title = isApproved ? 'Izin Praktikum Disetujui' : 'Izin Praktikum Ditolak';
    let body = `Pengajuan izin Anda untuk sesi ${moduleTitle} telah ${
      isApproved ? 'disetujui' : 'ditolak'
    } oleh asisten.`;
    if (decisionNote && decisionNote.trim()) {
      body += ` Catatan: ${decisionNote.trim()}`;
    }

    const message: ExpoPushMessage = {
      to: tokenData.token,
      title,
      body,
      sound: 'default',
      channelId: NOTIFICATION_CHANNEL_ID,
      priority: 'high',
      data: {
        type: 'permit_decided',
        url: `/praktikan/presensi?classId=${permit.classId}&sessionId=${permit.sessionId}`,
        permitId,
        classId: permit.classId,
        sessionId: permit.sessionId,
        status: decision,
      },
    };

    await sendExpoPushNotifications([message]);
  } catch (error) {
    console.warn('Gagal memproses notifikasi keputusan izin:', error);
  }
}
