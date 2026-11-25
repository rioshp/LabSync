import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AuthButton, AuthError, AuthField } from '@/components/auth-screen';
import { Card, Confirm, Feedback, Page, styles } from '@/features/participation/ui';
import { useAuth } from '@/hooks/useAuth';
import { mutate, mutationError, newRequestId } from '@/lib/mutations';
import LabLocationPicker, { type LabLocationDraft } from './lab-location-picker';
import type { Lab } from './types';
import { useLabs } from './useLabs';

type Draft = {
  id?: string;
  requestId: string;
  name: string;
  description: string;
  location: LabLocationDraft | null;
};

export default function AssistantLabs() {
  const { user, role } = useAuth();
  const labs = useLabs();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [archive, setArchive] = useState<Lab | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  function edit(lab?: Lab) {
    setError(null);
    setDraft({
      id: lab?.id,
      requestId: newRequestId(),
      name: lab?.name ?? '',
      description: lab?.description ?? '',
      location: lab
        ? { latitude: lab.latitude, longitude: lab.longitude, radiusMeters: lab.radiusMeters }
        : null,
    });
  }
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (archive) {
        await mutate('archiveLab', { labId: archive.id });
        setArchive(null);
      } else if (draft) {
        if (!draft.location)
          throw new Error('Pilih titik dan radius laboratorium terlebih dahulu.');
        await mutate(draft.id ? 'updateLab' : 'createLab', {
          labId: draft.id,
          requestId: draft.requestId,
          name: draft.name,
          description: draft.description,
          ...draft.location,
        });
        setDraft(null);
      }
    } catch (err) {
      setError(mutationError(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (role !== 'asisten')
    return (
      <Page detail title="Kelola laboratorium">
        <Card title="Halaman ini khusus asisten." />
      </Page>
    );
  return (
    <Page detail title="Laboratorium" subtitle="Tentukan titik dan area presensi di peta.">
      <AuthButton title="Tambah laboratorium" onPress={() => edit()} />
      <Feedback {...labs} retry={labs.retry} />
      {!labs.loading && !labs.error && !labs.items.length ? (
        <Card title="Belum ada laboratorium" />
      ) : null}
      {labs.items.map((lab) => (
        <Card key={lab.id} title={lab.name}>
          {lab.description ? <Text style={styles.text}>{lab.description}</Text> : null}
          <Text style={styles.muted}>
            {lab.latitude.toFixed(6)}, {lab.longitude.toFixed(6)} · radius {lab.radiusMeters} m
          </Text>
          {lab.assistantUid === user?.uid ? (
            <View style={{ gap: 8 }}>
              <AuthButton
                title="Ubah lokasi dan informasi"
                variant="outline"
                onPress={() => edit(lab)}
              />
              <AuthButton
                title="Arsipkan"
                variant="danger"
                onPress={() => {
                  setError(null);
                  setArchive(lab);
                }}
              />
            </View>
          ) : (
            <Text style={styles.muted}>
              Dikelola asisten lain; tersedia untuk penjadwalan sesi.
            </Text>
          )}
        </Card>
      ))}
      {draft && !picking ? (
        <Confirm
          title={draft.id ? 'Ubah laboratorium' : 'Laboratorium baru'}
          onCancel={() => {
            if (!busy) setDraft(null);
          }}
        >
          <AuthField
            label="Nama laboratorium"
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
            maxLength={100}
            editable={!busy}
          />
          <AuthField
            label="Keterangan gedung/lantai"
            value={draft.description}
            onChangeText={(description) => setDraft({ ...draft, description })}
            maxLength={500}
            multiline
            editable={!busy}
          />
          <Text style={styles.muted}>
            {draft.location
              ? `${draft.location.latitude.toFixed(6)}, ${draft.location.longitude.toFixed(6)} · ${draft.location.radiusMeters} m`
              : 'Belum memilih lokasi.'}
          </Text>
          <AuthButton
            title="Pilih lokasi di peta"
            variant="outline"
            disabled={busy}
            onPress={() => setPicking(true)}
          />
          <AuthError message={error} />
          <AuthButton title="Simpan laboratorium" onPress={() => void save()} busy={busy} />
        </Confirm>
      ) : null}
      {draft && picking ? (
        <LabLocationPicker
          value={draft.location}
          onCancel={() => setPicking(false)}
          onConfirm={(location) => {
            setDraft({ ...draft, location });
            setPicking(false);
          }}
        />
      ) : null}
      {archive ? (
        <Confirm
          title="Arsipkan laboratorium?"
          onCancel={() => {
            if (!busy) setArchive(null);
          }}
        >
          <Text style={styles.text}>
            {archive.name} tidak tersedia untuk sesi baru. Presensi pada sesi yang masih memakai lab
            ini akan diblokir; selesaikan sesi tersebut terlebih dahulu.
          </Text>
          <AuthError message={error} />
          <AuthButton
            title="Arsipkan laboratorium"
            variant="danger"
            busy={busy}
            onPress={() => void save()}
          />
        </Confirm>
      ) : null}
    </Page>
  );
}
