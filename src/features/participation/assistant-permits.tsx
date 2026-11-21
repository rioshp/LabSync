import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthButton, AuthError, AuthField } from '@/components/auth-screen';
import { useAuth } from '@/hooks/useAuth';
import { mutate, mutationError } from '@/lib/mutations';

import { formatTime, permitStatuses, useLive, type Permit } from './data';
import { Card, Confirm, Feedback, Page, styles } from './ui';

type Decision = 'approved' | 'rejected';
type Filter = Permit['status'] | 'all';
const filters: Filter[] = ['all', 'pending', 'approved', 'rejected'];

export default function AssistantPermits() {
  const { user, role } = useAuth();
  return user && role === 'asisten' ? <PermitInbox key={user.uid} uid={user.uid} /> : null;
}

function PermitInbox({ uid }: { uid: string }) {
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>('pending');
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<{
    id: string;
    student: string;
    decision: Decision;
  } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const constraints = [{ field: 'assistantUid', value: uid }];
  if (filter !== 'all') constraints.push({ field: 'status', value: filter });
  const permits = useLive<Permit[]>(
    uid,
    { kind: 'list', path: 'permits', filters: constraints, order: 'submittedAt', pageSize },
    attempt,
  );

  function choose(permit: Permit, decision: Decision) {
    setSelected({ id: permit.id, student: permit.studentNameSnapshot, decision });
    setNote('');
    setError(null);
    setNotice('');
  }

  async function confirm() {
    if (lock.current || !selected) return;
    if (selected.decision === 'rejected' && !note.trim()) return setError('Isi alasan penolakan.');
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await mutate('decidePermit', {
        permitId: selected.id,
        decision: selected.decision,
        decisionNote: note.trim() || undefined,
      });
      setNotice('Keputusan izin tersimpan.');
      setSelected(null);
    } catch (error) {
      setError(mutationError(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Page title="Daftar izin">
      <View style={local.filters}>
        {filters.map((item) => (
          <AuthButton
            key={item}
            title={item === 'all' ? 'Semua' : permitStatuses[item]}
            disabled={filter === item}
            onPress={() => {
              setFilter(item);
              setPageSize(20);
            }}
          />
        ))}
      </View>
      <Feedback {...permits} retry={() => setAttempt((n) => n + 1)} />
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {notice}
        </Text>
      ) : null}
      {permits.data?.length === 0 && <Card title="Tidak ada pengajuan pada daftar ini." />}
      {permits.data?.map((permit) => (
        <Card key={permit.id} title={permit.studentNameSnapshot}>
          <Text style={styles.text}>
            NIM {permit.nimSnapshot} · {permit.sessionSnapshot.className}
          </Text>
          <Text style={styles.text}>
            {permit.sessionSnapshot.practicumName} · {permit.sessionSnapshot.moduleTitle}
          </Text>
          <Text style={styles.text}>
            {formatTime(permit.submittedAt, permit.sessionSnapshot.timeZone)}
          </Text>
          <Text style={styles.badge}>{permitStatuses[permit.status]}</Text>
          <Text style={styles.text}>{permit.reason}</Text>
          {permit.decisionNote && <Text style={styles.text}>Catatan · {permit.decisionNote}</Text>}
          {permit.status === 'pending' && (
            <>
              <AuthButton
                title="Setujui"
                onPress={() => choose(permit, 'approved')}
                disabled={permits.offline}
              />
              <AuthButton
                title="Tolak"
                onPress={() => choose(permit, 'rejected')}
                disabled={permits.offline}
              />
            </>
          )}
        </Card>
      ))}
      {permits.data?.length === pageSize && (
        <AuthButton title="Tampilkan lebih banyak" onPress={() => setPageSize((n) => n + 20)} />
      )}
      {selected && (
        <Confirm
          title={
            (selected.decision === 'approved' ? 'Setujui' : 'Tolak') +
            ' izin ' +
            selected.student +
            '?'
          }
          onCancel={() => {
            if (!busy) setSelected(null);
          }}
        >
          <AuthField
            label={selected.decision === 'rejected' ? 'Alasan penolakan' : 'Catatan (opsional)'}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            multiline
            editable={!busy}
          />
          <AuthError message={error} />
          <AuthButton title="Konfirmasi" onPress={confirm} busy={busy} />
          <AuthButton title="Batal" onPress={() => setSelected(null)} disabled={busy} />
        </Confirm>
      )}
    </Page>
  );
}

const local = StyleSheet.create({ filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
