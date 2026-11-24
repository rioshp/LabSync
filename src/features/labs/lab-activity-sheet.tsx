import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { AuthButton } from '@/components/auth-screen';
import { formatDateTime } from '@/features/academic/time';
import { Card, Feedback, styles } from '@/features/participation/ui';
import { calculateDistanceMeters, type Coordinates } from '@/lib/location';
import type { Lab, LabSchedule } from './types';
import { useLabSchedules } from './useLabs';
import { selectLabActivities } from './activity';

export default function LabActivitySheet({
  lab,
  userLocation,
  onClose,
}: {
  lab: Lab;
  userLocation: Coordinates | null;
  onClose: () => void;
}) {
  const sessions = useLabSchedules(lab.id);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const { ongoing, upcoming } = selectLabActivities(sessions.items, now);
  function activity(session: LabSchedule) {
    return (
      <View key={session.id} style={{ gap: 3 }}>
        <Text style={styles.heading}>
          {session.practicumName} · {session.className}
        </Text>
        <Text style={styles.text}>{session.moduleTitle}</Text>
        <Text style={styles.muted}>
          {formatDateTime(session.startsAt.toDate(), session.timeZone)} –{' '}
          {formatDateTime(session.endsAt.toDate(), session.timeZone)}
        </Text>
        <Text style={styles.badgeSoft}>
          {session.status === 'open' ? 'Dibuka' : 'Terjadwal'}
          {session.status === 'open' && session.endsAt.toMillis() < now
            ? ' · melewati jadwal selesai'
            : ''}
        </Text>
      </View>
    );
  }
  return (
    <Card title={lab.name}>
      {lab.description ? <Text style={styles.text}>{lab.description}</Text> : null}
      <Text style={styles.muted}>
        Radius presensi {lab.radiusMeters} m
        {userLocation
          ? ` · ${Math.round(calculateDistanceMeters(userLocation, lab))} m dari posisimu`
          : ''}
      </Text>
      <Feedback {...sessions} />
      <Text style={styles.heading}>Sedang berlangsung</Text>
      {ongoing.length ? (
        ongoing.map(activity)
      ) : !sessions.loading && !sessions.error ? (
        <Text style={styles.muted}>Tidak ada sesi yang sedang dibuka.</Text>
      ) : null}
      <Text style={styles.heading}>Praktikum berikutnya</Text>
      {upcoming.length ? (
        upcoming.map(activity)
      ) : !sessions.loading && !sessions.error ? (
        <Text style={styles.muted}>Belum ada jadwal berikutnya.</Text>
      ) : null}
      <AuthButton title="Tutup aktivitas" variant="outline" onPress={onClose} />
    </Card>
  );
}
