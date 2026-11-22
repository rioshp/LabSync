import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateTime } from '@/features/academic/time';
import { AuthButton, AuthError, AuthField } from '@/components/auth-screen';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { mutate, mutationError } from '@/lib/mutations';

import { permitStatuses, useLive, type Permit } from './data';
import { Card, Confirm, Feedback, Page, styles } from './ui';

type Decision = 'approved' | 'rejected';
type Filter = Permit['status'] | 'all';
const filters: Filter[] = ['pending', 'all', 'approved', 'rejected'];

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
    subtitle: string;
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
    setSelected({
      id: permit.id,
      student: permit.studentNameSnapshot,
      subtitle: `${permit.sessionSnapshot.className} · ${permit.sessionSnapshot.moduleTitle}`,
      decision,
    });
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
      setNotice(selected.decision === 'approved' ? 'Izin disetujui.' : 'Izin ditolak.');
      setSelected(null);
    } catch (error) {
      setError(mutationError(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Page arc tabScreen backdrop="geometric">
      <View style={local.filters}>
        {filters.map((item) => {
          const active = filter === item;
          const label = item === 'all' ? 'Semua' : permitStatuses[item];
          const countSuffix =
            active && !permits.loading && permits.data ? ` (${permits.data.length})` : '';
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              disabled={active}
              onPress={() => {
                setFilter(item);
                setPageSize(20);
              }}
              style={[local.filterChip, active && local.filterChipActive]}
            >
              <Text style={[local.filterText, active && local.filterTextActive]}>
                {label}
                {countSuffix}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Feedback {...permits} retry={() => setAttempt((n) => n + 1)} />
      {notice ? (
        <View style={local.noticeBox}>
          <Text accessibilityLiveRegion="polite" style={local.noticeText}>
            {notice}
          </Text>
        </View>
      ) : null}

      {permits.data?.length === 0 ? <Card title="Tidak ada pengajuan pada daftar ini." /> : null}

      {permits.data?.map((permit) => (
        <Card key={permit.id}>
          <View style={local.cardTop}>
            <Text style={styles.heading}>{permit.studentNameSnapshot}</Text>
            <Text
              style={
                permit.status === 'rejected'
                  ? styles.badgeDanger
                  : permit.status === 'approved'
                    ? styles.badge
                    : styles.badgeSoft
              }
            >
              {permitStatuses[permit.status]}
            </Text>
          </View>
          <Text style={styles.muted}>
            NIM {permit.nimSnapshot} · {permit.sessionSnapshot.className} ·{' '}
            {permit.sessionSnapshot.moduleTitle}
          </Text>
          <Text style={styles.muted}>
            {formatDateTime(permit.submittedAt.toDate(), permit.sessionSnapshot.timeZone)}
          </Text>
          <View style={local.reasonBox}>
            <Text style={styles.text}>{permit.reason}</Text>
          </View>
          {permit.decisionNote ? (
            <Text style={styles.muted}>Catatan · {permit.decisionNote}</Text>
          ) : null}
          {permit.status === 'pending' ? (
            <View style={local.actionRow}>
              <View style={local.actionCol}>
                <AuthButton
                  title="Tolak"
                  variant="danger"
                  onPress={() => choose(permit, 'rejected')}
                  disabled={permits.offline}
                />
              </View>
              <View style={local.actionCol}>
                <AuthButton
                  title="Setujui"
                  variant="primary"
                  onPress={() => choose(permit, 'approved')}
                  disabled={permits.offline}
                />
              </View>
            </View>
          ) : null}
        </Card>
      ))}

      {permits.data?.length === pageSize ? (
        <AuthButton
          title="Tampilkan lebih banyak"
          variant="outline"
          onPress={() => setPageSize((n) => n + 20)}
        />
      ) : null}

      {selected ? (
        <Confirm
          title={
            (selected.decision === 'approved' ? 'Setujui' : 'Tolak') +
            ' izin ' +
            selected.student +
            '?'
          }
          subtitle={selected.subtitle}
          danger={selected.decision === 'rejected'}
          onCancel={() => {
            if (!busy) setSelected(null);
          }}
        >
          <AuthField
            label={
              selected.decision === 'rejected' ? 'Alasan penolakan (wajib)' : 'Catatan (opsional)'
            }
            value={note}
            onChangeText={setNote}
            placeholder={
              selected.decision === 'rejected'
                ? 'Tuliskan alasan penolakan izin…'
                : 'Tambahkan catatan untuk praktikan (opsional)…'
            }
            maxLength={500}
            multiline
            editable={!busy}
          />
          <AuthError message={error} />
          <View style={local.actionRow}>
            <View style={local.actionCol}>
              <AuthButton
                title="Batal"
                variant="soft"
                onPress={() => setSelected(null)}
                disabled={busy}
              />
            </View>
            <View style={local.actionCol}>
              <AuthButton
                title={selected.decision === 'approved' ? 'Setujui izin' : 'Tolak izin'}
                variant={selected.decision === 'rejected' ? 'danger' : 'primary'}
                onPress={confirm}
                busy={busy}
              />
            </View>
          </View>
        </Confirm>
      ) : null}
    </Page>
  );
}

const local = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: BrandColors.paper,
    borderWidth: 1,
    borderColor: BrandColors.line,
  },
  filterChipActive: {
    backgroundColor: BrandColors.ink,
    borderColor: BrandColors.ink,
  },
  filterText: {
    color: BrandColors.muted,
    fontSize: 12.5,
    fontWeight: '700',
  },
  filterTextActive: {
    color: BrandColors.paper,
    fontWeight: '800',
  },
  noticeBox: {
    backgroundColor: BrandColors.soft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    color: BrandColors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reasonBox: {
    backgroundColor: BrandColors.pageBackground,
    borderRadius: 14,
    padding: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionCol: {
    flex: 1,
  },
});
