import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from '@react-native-firebase/firestore';
import type { Lab, LabSchedule } from '@/features/labs/types';
import { createId, firestoreSession, readId, readText } from './firestore-input';
import { readCoordinates, readRadius } from './location';

export function parseLab(id: string, data: Record<string, unknown>): Lab {
  if (data.status !== 'active' && data.status !== 'archived')
    throw new Error('Status laboratorium tidak valid.');
  return {
    id,
    ...readCoordinates(data),
    name: readText(data.name, 'Nama laboratorium', 1, 100),
    description: typeof data.description === 'string' ? data.description : '',
    radiusMeters: readRadius(data.radiusMeters),
    status: data.status,
    assistantUid: readId(data.assistantUid, 'Pemilik laboratorium'),
  };
}

export function parseLabSchedule(id: string, data: Record<string, unknown>): LabSchedule {
  if (
    !['scheduled', 'open', 'closed', 'cancelled'].includes(String(data.status)) ||
    !(data.startsAt instanceof Timestamp) ||
    !(data.endsAt instanceof Timestamp) ||
    data.endsAt.toMillis() <= data.startsAt.toMillis()
  )
    throw new Error('Jadwal laboratorium tidak valid.');
  return {
    id,
    labId: readId(data.labId, 'Laboratorium'),
    classId: readId(data.classId, 'Kelas'),
    sessionId: readId(data.sessionId, 'Sesi'),
    assistantUid: readId(data.assistantUid, 'Asisten'),
    practicumName: readText(data.practicumName, 'Praktikum', 1, 100),
    className: readText(data.className, 'Kelas', 1, 100),
    moduleTitle: readText(data.moduleTitle, 'Modul', 1, 120),
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    timeZone: readText(data.timeZone, 'Zona waktu', 1, 100),
    status: data.status as LabSchedule['status'],
  };
}

export async function changeLab(
  action: 'createLab' | 'updateLab' | 'archiveLab',
  fields: Record<string, unknown>,
) {
  const { db, uid } = await firestoreSession();
  const creating = action === 'createLab';
  const archiving = action === 'archiveLab';
  const id = creating ? createId(uid, fields.requestId) : readId(fields.labId, 'Laboratorium');
  const details = archiving
    ? null
    : {
        name: readText(fields.name, 'Nama laboratorium', 1, 100),
        description: readText(fields.description ?? '', 'Keterangan', 0, 500),
        ...readCoordinates(fields),
        radiusMeters: readRadius(fields.radiusMeters),
      };
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'labs', id);
    const existing = (await tx.get(ref)).data();
    const profile = (await tx.get(doc(db, 'users', uid))).data();
    if (profile?.role !== 'asisten' || profile.accountStatus !== 'active')
      throw new Error('Halaman ini khusus asisten aktif.');
    if (existing && existing.assistantUid !== uid)
      throw new Error('Laboratorium ini dikelola asisten lain.');
    if (creating && existing) {
      if (details && Object.entries(details).every(([key, value]) => existing[key] === value))
        return { id };
      throw new Error('Permintaan ini sudah digunakan. Buka kembali formulir laboratorium.');
    }
    if (!creating && !existing) throw new Error('Laboratorium tidak ditemukan.');
    if (archiving && existing?.status === 'archived') return { id };
    if (existing?.status === 'archived') throw new Error('Laboratorium sudah diarsipkan.');
    const audit = { updatedBy: uid, updatedAt: serverTimestamp() };
    if (creating)
      tx.set(ref, {
        ...details,
        ...audit,
        assistantUid: uid,
        status: 'active',
        createdAt: serverTimestamp(),
        archivedAt: null,
      });
    else if (archiving)
      tx.update(ref, { ...audit, status: 'archived', archivedAt: serverTimestamp() });
    else tx.update(ref, { ...details, ...audit });
    return { id };
  });
}

type LiveOptions<T> = {
  onChange: (items: T[], offline: boolean) => void;
  onError: (error: unknown) => void;
};

export function subscribeLabs(options: LiveOptions<Lab>) {
  return subscribeCollection(
    'labs',
    [where('status', '==', 'active'), orderBy('name')],
    parseLab,
    options,
  );
}

export function subscribeLabSchedules(labId: string, options: LiveOptions<LabSchedule>) {
  return subscribeCollection(
    'labSchedules',
    [
      where('labId', '==', labId),
      where('status', 'in', ['open', 'scheduled']),
      orderBy('startsAt'),
    ],
    parseLabSchedule,
    options,
  );
}

function subscribeCollection<T>(
  path: string,
  constraints: Parameters<typeof query>[1][],
  parse: (id: string, data: Record<string, unknown>) => T,
  { onChange, onError }: LiveOptions<T>,
): () => void {
  let active = true;
  let stop = () => {};
  void import('./firebase')
    .then(({ db }) => {
      if (!active) return;
      stop = onSnapshot(
        query(collection(db, path), ...constraints),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!active) return;
          try {
            onChange(
              snapshot.docs.map((item) => parse(item.id, item.data())),
              snapshot.metadata.fromCache,
            );
          } catch (error) {
            onError(error);
          }
        },
        (error) => {
          if (active) onError(error);
        },
      );
    })
    .catch((error) => {
      if (active) onError(error);
    });
  return () => {
    active = false;
    stop();
  };
}
