import { Link } from 'expo-router';
import { useReducer, useState } from 'react';
import { Text } from 'react-native';

import { AuthButton } from '@/components/auth-screen';
import { SessionStatusStyles } from '@/constants/theme';
import { demoReducer, fixtures, identities, initialDemo } from '@/features/demo/state';
import { Card, Confirm, Page, styles } from '@/features/participation/ui';

const format = (time: number) => new Date(time).toLocaleString('id-ID');

export default function LocalDemo() {
  const [state, dispatch] = useReducer(demoReducer, initialDemo);
  const [actor, setActor] = useState<(typeof identities)[number] | null>(null);
  const [selected, setSelected] = useState<(typeof fixtures)[number] | null>(null);
  const [confirm, setConfirm] = useState<'open' | 'close' | null>(null);

  if (!actor)
    return (
      <Page title="Demo praktikum">
        <Text style={styles.text}>
          Pilih identitas demo. Perubahan hanya disimpan selama demo ini terbuka.
        </Text>
        {identities.map((identity) => (
          <AuthButton
            key={identity.id}
            title={identity.name + ' · ' + identity.role}
            onPress={() => setActor(identity)}
          />
        ))}
        <Link href="/" style={styles.link}>
          ‹ Kembali ke masuk
        </Link>
      </Page>
    );

  const list = selected
    ? state.attendance.filter((record) => record.sessionId === selected.id)
    : [];
  const mine = list.find((record) => record.studentId === actor.id);
  const status = selected ? (state.status[selected.id] ?? 'scheduled') : 'scheduled';

  return (
    <Page title={selected ? 'Detail sesi' : 'Jadwal demo'}>
      <Text style={styles.text}>
        {actor.name} · {actor.role}
      </Text>
      <AuthButton
        title={selected ? 'Kembali ke jadwal' : 'Ganti identitas'}
        onPress={() => {
          if (selected) setSelected(null);
          else setActor(null);
        }}
      />
      {selected ? (
        <>
          <Card title={selected.title}>
            <Text style={styles.text}>
              {selected.practicum} · {selected.className}
            </Text>
            <Text style={styles.text}>
              {selected.room} · {selected.time}
            </Text>
            <Text style={styles.badge}>{SessionStatusStyles[status].label}</Text>
            {actor.role === 'asisten' && status !== 'closed' && (
              <AuthButton
                title={status === 'open' ? 'Tutup sesi' : 'Buka sesi'}
                onPress={() => setConfirm(status === 'open' ? 'close' : 'open')}
              />
            )}
            {actor.role === 'praktikan' && mine && (
              <Text accessibilityLiveRegion="polite" style={styles.text}>
                Presensi tercatat · {format(mine.time)}
              </Text>
            )}
            {actor.role === 'praktikan' && !mine && status === 'open' && (
              <AuthButton
                title="Presensi sekarang"
                onPress={() =>
                  dispatch({
                    kind: 'checkIn',
                    actorId: actor.id,
                    sessionId: selected.id,
                    time: Date.now(),
                  })
                }
              />
            )}
          </Card>
          {actor.role === 'asisten' && (
            <Card title={'Rekap hadir · ' + list.length}>
              {list.length === 0 && (
                <Text style={styles.text}>Belum ada praktikan yang presensi.</Text>
              )}
              {list.map((record) => (
                <Text key={record.studentId} style={styles.text}>
                  {identities.find((identity) => identity.id === record.studentId)?.name} ·{' '}
                  {format(record.time)}
                </Text>
              ))}
            </Card>
          )}
          {confirm && (
            <Confirm
              title={confirm === 'open' ? 'Buka sesi ini?' : 'Tutup sesi ini?'}
              onCancel={() => setConfirm(null)}
            >
              <AuthButton
                title="Konfirmasi"
                onPress={() => {
                  dispatch({ kind: confirm, actorId: actor.id, sessionId: selected.id });
                  setConfirm(null);
                }}
              />
              <AuthButton title="Batal" onPress={() => setConfirm(null)} />
            </Confirm>
          )}
        </>
      ) : (
        <>
          {fixtures.map((session) => (
            <Card key={session.id} title={session.title}>
              <Text style={styles.text}>
                {session.practicum} · {session.className} · {session.time}
              </Text>
              <Text style={styles.badge}>
                {SessionStatusStyles[state.status[session.id] ?? 'scheduled'].label}
              </Text>
              <AuthButton title="Lihat detail" onPress={() => setSelected(session)} />
            </Card>
          ))}
          {actor.role === 'praktikan' && (
            <Card title="Riwayat saya">
              {state.attendance
                .filter((record) => record.studentId === actor.id)
                .map((record) => (
                  <Text key={record.sessionId} style={styles.text}>
                    {fixtures.find((session) => session.id === record.sessionId)?.title} ·{' '}
                    {format(record.time)}
                  </Text>
                ))}
              {!state.attendance.some((record) => record.studentId === actor.id) && (
                <Text style={styles.text}>Belum ada presensi.</Text>
              )}
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
