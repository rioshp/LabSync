import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthButton } from '@/components/auth-screen';
import { BrandColors, SessionStatusStyles } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { mutationError, mutate, newRequestId } from '@/lib/mutations';
import {
  useAssistantClasses,
  useAssistantPracticums,
  useClassRoster,
  useClassSessions,
} from '@/features/academic/useAcademic';
import type { AcademicClass, AcademicSession, Practicum } from '@/features/academic/types';
import { formatSessionRange, zonedDateTimeToEpochMs } from '@/features/academic/time';

import { styles } from './assistant-practicum.styles';

type Draft = {
  name: string;
  timeZone: string;
  moduleTitle: string;
  room: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  requestId: string;
};

type Dialog =
  | { kind: 'practicum'; item?: Practicum }
  | { kind: 'class'; practicumId: string; item?: AcademicClass }
  | { kind: 'session'; classInfo: AcademicClass; item?: AcademicSession }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      label: string;
      destructive: boolean;
      onConfirm: () => Promise<void>;
    };

const EMPTY_DRAFT: Draft = {
  name: '',
  timeZone: 'Asia/Jakarta',
  moduleTitle: '',
  room: '',
  date: '',
  endDate: '',
  startTime: '',
  endTime: '',
  requestId: '',
};

export default function AssistantPracticumRoute() {
  const insets = useSafeAreaInsets();
  const { user, role } = useAuth();
  const uid = user?.uid;
  const practicumsState = useAssistantPracticums(uid);
  const practicums = practicumsState.value;
  const [selectedPracticumId, setSelectedPracticumId] = useState<string | null>(null);
  const selectedPracticum =
    practicums.find((item) => item.id === selectedPracticumId) ?? practicums[0] ?? null;
  const classesState = useAssistantClasses(uid, selectedPracticum?.id ?? null);
  const classes = classesState.value;
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const selectedClass =
    classes.find((item) => item.id === selectedClassId) ??
    classes.find((item) => item.status === 'active') ??
    classes[0] ??
    null;
  const rosterState = useClassRoster(uid, selectedClass?.id ?? null);
  const sessionsState = useClassSessions(uid, selectedClass?.id ?? null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [screenMessage, setScreenMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nimInput, setNimInput] = useState('');
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [lookingUpStudent, setLookingUpStudent] = useState(false);
  const formLock = useRef(false);
  const confirmLock = useRef(false);
  const rosterLock = useRef(false);

  function openPracticumForm(item?: Practicum) {
    setDraft({ ...EMPTY_DRAFT, name: item?.name ?? '', requestId: newRequestId() });
    setDialogError(null);
    setDialog({ kind: 'practicum', item });
  }

  function openClassForm(practicumId: string, item?: AcademicClass) {
    setDraft({
      ...EMPTY_DRAFT,
      name: item?.name ?? '',
      timeZone: item?.timeZone ?? 'Asia/Jakarta',
      requestId: newRequestId(),
    });
    setDialogError(null);
    setDialog({ kind: 'class', practicumId, item });
  }

  function openSessionForm(classInfo: AcademicClass, item?: AcademicSession) {
    setDraft({
      ...EMPTY_DRAFT,
      moduleTitle: item?.module ?? '',
      room: item?.room ?? '',
      date: item?.date ?? '',
      endDate: item?.endDate ?? item?.date ?? '',
      startTime: item?.startTime ?? '',
      endTime: item?.endTime ?? '',
      requestId: newRequestId(),
    });
    setDialogError(null);
    setDialog({ kind: 'session', classInfo, item });
  }

  function askForConfirmation(
    title: string,
    message: string,
    label: string,
    onConfirm: () => Promise<void>,
    destructive = true,
  ) {
    setDialogError(null);
    setDialog({ kind: 'confirm', title, message, label, onConfirm, destructive });
  }

  function requestArchivePracticum(item: Practicum) {
    if (item.activeClassCount > 0) {
      setScreenMessage(
        `Arsip ${item.name} belum tersedia karena masih memiliki ${item.activeClassCount} kelas aktif. Arsipkan kelasnya terlebih dahulu.`,
      );
      return;
    }
    askForConfirmation(
      'Arsipkan praktikum?',
      `${item.name} akan disembunyikan dari daftar aktif. Riwayat tetap tersimpan.`,
      'Arsipkan',
      async () => {
        await mutate('archivePracticum', { practicumId: item.id });
      },
    );
  }

  function requestArchiveClass(item: AcademicClass) {
    if (item.unfinishedSessionCount > 0) {
      setScreenMessage(
        `Kelas ${item.name} masih memiliki sesi yang belum selesai. Selesaikan atau batalkan sesi tersebut sebelum mengarsipkan kelas.`,
      );
      return;
    }
    askForConfirmation(
      'Arsipkan kelas?',
      `${item.name} akan dikeluarkan dari daftar kelas aktif. Data dan riwayat tetap tersimpan.`,
      'Arsipkan',
      async () => {
        await mutate('archiveClass', { classId: item.id });
      },
    );
  }

  function requestRemoveStudent(studentUid: string, name: string) {
    if (!selectedClass) return;
    askForConfirmation(
      'Keluarkan peserta?',
      `${name} tidak lagi melihat jadwal kelas ini. Riwayat yang sudah tercatat tetap tersedia.`,
      'Keluarkan',
      async () => {
        await mutate('removeStudent', { classId: selectedClass.id, studentUid });
      },
    );
  }

  function requestCancelSession(item: AcademicSession) {
    askForConfirmation(
      'Batalkan sesi?',
      `${item.module} pada ${formatSessionRange(item)} akan ditandai dibatalkan.`,
      'Batalkan sesi',
      async () => {
        await mutate('cancelSession', { classId: item.classId, sessionId: item.id });
      },
    );
  }

  async function submitForm() {
    if (!dialog || dialog.kind === 'confirm' || formLock.current) return;
    formLock.current = true;
    setDialogError(null);
    setBusy(true);
    try {
      if (dialog.kind === 'practicum') {
        const name = draft.name.trim();
        if (!name || name.length > 100)
          throw new Error('Nama praktikum wajib diisi, maksimal 100 karakter.');
        if (dialog.item) await mutate('updatePracticum', { practicumId: dialog.item.id, name });
        else await mutate('createPracticum', { name, requestId: draft.requestId });
      } else if (dialog.kind === 'class') {
        const name = draft.name.trim();
        const timeZone = draft.timeZone.trim();
        if (!name || name.length > 100)
          throw new Error('Nama kelas wajib diisi, maksimal 100 karakter.');
        try {
          new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
        } catch {
          throw new Error('Masukkan zona waktu IANA yang valid, misalnya Asia/Jakarta.');
        }
        if (dialog.item) await mutate('updateClass', { classId: dialog.item.id, name, timeZone });
        else
          await mutate('createClass', {
            practicumId: dialog.practicumId,
            name,
            timeZone,
            requestId: draft.requestId,
          });
      } else {
        const moduleTitle = draft.moduleTitle.trim();
        const room = draft.room.trim();
        if (!moduleTitle || moduleTitle.length > 120)
          throw new Error('Topik wajib diisi, maksimal 120 karakter.');
        if (!room || room.length > 120)
          throw new Error('Ruang wajib diisi, maksimal 120 karakter.');
        const startsAt = zonedDateTimeToEpochMs(
          draft.date,
          draft.startTime,
          dialog.classInfo.timeZone,
        );
        const endsAt = zonedDateTimeToEpochMs(
          draft.endDate,
          draft.endTime,
          dialog.classInfo.timeZone,
        );
        if (endsAt <= startsAt) throw new Error('Waktu selesai harus setelah waktu mulai.');
        if (dialog.item) {
          await mutate('updateSession', {
            classId: dialog.classInfo.id,
            sessionId: dialog.item.id,
            moduleTitle,
            room,
            startsAt,
            endsAt,
          });
        } else {
          await mutate('createSession', {
            classId: dialog.classInfo.id,
            moduleTitle,
            room,
            startsAt,
            endsAt,
            requestId: draft.requestId,
          });
        }
      }
      setDialog(null);
      setScreenMessage(null);
    } catch (error) {
      setDialogError(mutationError(error));
    } finally {
      formLock.current = false;
      setBusy(false);
    }
  }

  async function confirmDialog() {
    if (!dialog || dialog.kind !== 'confirm' || confirmLock.current) return;
    confirmLock.current = true;
    setBusy(true);
    setDialogError(null);
    try {
      await dialog.onConfirm();
      setDialog(null);
      setScreenMessage(null);
    } catch (error) {
      setDialogError(mutationError(error));
    } finally {
      confirmLock.current = false;
      setBusy(false);
    }
  }

  async function findStudent() {
    const nim = nimInput.trim();
    if (!selectedClass || !nim || rosterLock.current) return;

    const { id: classId, name: className } = selectedClass;
    rosterLock.current = true;
    setLookingUpStudent(true);
    setRosterError(null);
    try {
      const candidate = await mutate<{
        studentUid: string | null;
        displayName: string | null;
        nim: string | null;
      }>('lookupStudent', { classId, nim });
      const { studentUid, displayName, nim: matchedNim } = candidate;
      if (!studentUid || !displayName || !matchedNim) {
        setRosterError('Tidak ada akun praktikan aktif dengan NIM tersebut.');
        return;
      }

      askForConfirmation(
        'Tambah peserta?',
        `${displayName} (NIM ${matchedNim}) akan ditambahkan ke kelas ${className}.`,
        'Tambah peserta',
        async () => {
          await mutate('addStudent', { classId, nim: matchedNim, studentUid, displayName });
          setNimInput('');
        },
        false,
      );
    } catch (error) {
      setRosterError(mutationError(error));
    } finally {
      rosterLock.current = false;
      setLookingUpStudent(false);
    }
  }

  if (role !== 'asisten') {
    return (
      <View style={styles.center}>
        <Text style={styles.cardTitle}>Halaman ini khusus asisten.</Text>
      </View>
    );
  }

  const isFormDialog = dialog && dialog.kind !== 'confirm';

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: 16, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" style={styles.title}>
          Kelola praktikum
        </Text>
        {[practicumsState, classesState, rosterState, sessionsState].some(
          (source) => source.offline,
        ) && (
          <Text accessibilityLiveRegion="polite" style={styles.offlineNotice}>
            Data mungkin belum terbaru. Periksa koneksi sebelum menyimpan.
          </Text>
        )}

        {screenMessage ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{screenMessage}</Text>
            <Pressable accessibilityRole="button" onPress={() => setScreenMessage(null)}>
              <Text style={styles.dismissText}>Tutup</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Praktikum
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => openPracticumForm()}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Buat praktikum</Text>
            </Pressable>
          </View>
          {practicumsState.loading ? (
            <Loading label="Memuat praktikum..." />
          ) : practicumsState.error ? (
            <LoadError message={practicumsState.error} retry={practicumsState.retry} />
          ) : practicums.length === 0 ? (
            <EmptyCard
              title="Belum ada praktikum"
              body="Buat praktikum pertama untuk mulai menambahkan kelas dan jadwal."
            />
          ) : (
            practicums.map((item) => {
              const selected = selectedPracticum?.id === item.id;
              return (
                <View
                  key={item.id}
                  style={[styles.resourceCard, selected && styles.resourceCardSelected]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setSelectedPracticumId(item.id);
                      setSelectedClassId(null);
                      setScreenMessage(null);
                    }}
                    style={styles.resourceMain}
                  >
                    <View style={styles.resourceTop}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <StatusPill
                        label={item.status === 'active' ? 'Aktif' : 'Diarsipkan'}
                        archived={item.status === 'archived'}
                      />
                    </View>
                    <Text style={styles.description}>
                      {item.activeClassCount} kelas aktif · {item.totalClassCount} total kelas
                    </Text>
                  </Pressable>
                  {item.status === 'active' && (
                    <View style={styles.resourceActions}>
                      <SmallButton label="Ubah" onPress={() => openPracticumForm(item)} />
                      <SmallButton
                        label="Arsipkan"
                        danger
                        onPress={() => requestArchivePracticum(item)}
                      />
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {selectedPracticum ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Kelas
                </Text>
                <Text style={styles.description}>{selectedPracticum.name}</Text>
              </View>
              {selectedPracticum.status === 'active' && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openClassForm(selectedPracticum.id)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Buat kelas</Text>
                </Pressable>
              )}
            </View>
            {classesState.loading ? (
              <Loading label="Memuat kelas..." />
            ) : classesState.error ? (
              <LoadError message={classesState.error} retry={classesState.retry} />
            ) : classes.length === 0 ? (
              <EmptyCard
                title="Belum ada kelas"
                body="Tambahkan kelas untuk mengelola peserta dan membuat sesi."
              />
            ) : (
              classes.map((item) => {
                const selected = selectedClass?.id === item.id;
                return (
                  <View
                    key={item.id}
                    style={[styles.resourceCard, selected && styles.resourceCardSelected]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setSelectedClassId(item.id);
                        setRosterError(null);
                      }}
                      style={styles.resourceMain}
                    >
                      <View style={styles.resourceTop}>
                        <Text style={styles.cardTitle}>{item.name}</Text>
                        <StatusPill
                          label={item.status === 'active' ? 'Aktif' : 'Diarsipkan'}
                          archived={item.status === 'archived'}
                        />
                      </View>
                      <Text style={styles.description}>
                        {item.timeZone} · {item.unfinishedSessionCount} sesi belum selesai
                      </Text>
                    </Pressable>
                    {item.status === 'active' && (
                      <View style={styles.resourceActions}>
                        {selected && (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => openSessionForm(item)}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>Buat sesi</Text>
                          </Pressable>
                        )}
                        <SmallButton
                          label="Ubah"
                          onPress={() => openClassForm(selectedPracticum.id, item)}
                        />
                        <SmallButton
                          label="Arsipkan"
                          danger
                          onPress={() => requestArchiveClass(item)}
                        />
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {selectedClass ? (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>
                    Peserta kelas
                  </Text>
                  <Text style={styles.description}>
                    {selectedClass.name}
                    {!rosterState.loading && !rosterState.error && rosterState.value.length > 0
                      ? ' · ' + rosterState.value.length + ' peserta aktif'
                      : ''}
                  </Text>
                </View>
              </View>
              {selectedClass.status === 'active' && (
                <View style={styles.addStudentRow}>
                  <TextInput
                    accessibilityLabel="Cari berdasarkan NIM"
                    value={nimInput}
                    onChangeText={setNimInput}
                    placeholder="Cari berdasarkan NIM"
                    placeholderTextColor={BrandColors.muted}
                    autoCapitalize="characters"
                    editable={!lookingUpStudent}
                    maxLength={30}
                    returnKeyType="search"
                    onSubmitEditing={() => void findStudent()}
                    style={[styles.input, styles.nimInput]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={!nimInput.trim() || lookingUpStudent}
                    onPress={() => void findStudent()}
                    style={[
                      styles.primaryButton,
                      (!nimInput.trim() || lookingUpStudent) && styles.buttonDisabled,
                    ]}
                  >
                    {lookingUpStudent ? (
                      <ActivityIndicator color={BrandColors.paper} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Cari</Text>
                    )}
                  </Pressable>
                </View>
              )}
              {rosterError ? (
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {rosterError}
                </Text>
              ) : null}
              {rosterState.loading ? (
                <Loading label="Memuat peserta..." />
              ) : rosterState.error ? (
                <LoadError message={rosterState.error} retry={rosterState.retry} />
              ) : rosterState.value.length === 0 ? (
                <EmptyCard title="Belum ada peserta" />
              ) : (
                rosterState.value.map((student) => (
                  <View key={student.id} style={styles.rosterRow}>
                    <View style={styles.rosterIdentity}>
                      <Text style={styles.cardTitle}>{student.studentNameSnapshot}</Text>
                      <Text style={styles.description}>NIM {student.nimSnapshot}</Text>
                    </View>
                    {selectedClass.status === 'active' && (
                      <SmallButton
                        label="Keluarkan"
                        danger
                        onPress={() =>
                          requestRemoveStudent(student.studentUid, student.studentNameSnapshot)
                        }
                      />
                    )}
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>
                    Jadwal sesi
                  </Text>
                  <Text style={styles.description}>
                    {selectedClass.name} · {selectedClass.timeZone}
                  </Text>
                </View>
              </View>
              {sessionsState.loading ? (
                <Loading label="Memuat sesi..." />
              ) : sessionsState.error ? (
                <LoadError message={sessionsState.error} retry={sessionsState.retry} />
              ) : sessionsState.value.length === 0 ? (
                <EmptyCard title="Belum ada sesi" />
              ) : (
                sessionsState.value.map((session) => {
                  const badge = SessionStatusStyles[session.status];
                  return (
                    <View key={session.id} style={styles.sessionCard}>
                      <View style={styles.resourceTop}>
                        <Text style={styles.cardTitle}>{session.module}</Text>
                        <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusPillText, { color: badge.text }]}>
                            {badge.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.description}>{formatSessionRange(session)}</Text>
                      <Text style={styles.description}>Ruang {session.room}</Text>
                      <View style={styles.resourceActions}>
                        <SmallButton
                          label="Rekap & detail"
                          onPress={() =>
                            router.push({
                              pathname: '/(app)/asisten/sesi',
                              params: { classId: session.classId, sessionId: session.id },
                            })
                          }
                        />
                        {session.status === 'scheduled' && (
                          <>
                            <SmallButton
                              label="Ubah jadwal"
                              onPress={() => openSessionForm(selectedClass, session)}
                            />
                            <SmallButton
                              label="Batalkan"
                              danger
                              onPress={() => requestCancelSession(session)}
                            />
                          </>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        ) : null}
      </ScrollView>

      <Modal
        transparent
        visible={!!dialog}
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setDialog(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalContent}
            >
              {dialog?.kind === 'confirm' ? (
                <>
                  <Text accessibilityRole="header" style={styles.modalTitle}>
                    {dialog.title}
                  </Text>
                  <Text style={styles.description}>{dialog.message}</Text>
                  {dialogError ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {dialogError}
                    </Text>
                  ) : null}
                  <View style={styles.modalActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => setDialog(null)}
                      style={styles.cancelButton}
                    >
                      <Text style={styles.cancelButtonText}>Batal</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => void confirmDialog()}
                      style={[
                        dialog.destructive ? styles.dangerButton : styles.primaryButton,
                        busy && styles.buttonDisabled,
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator color={BrandColors.paper} />
                      ) : (
                        <Text style={styles.primaryButtonText}>{dialog.label}</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : isFormDialog ? (
                <>
                  <Text accessibilityRole="header" style={styles.modalTitle}>
                    {dialog.kind === 'practicum'
                      ? dialog.item
                        ? 'Ubah praktikum'
                        : 'Praktikum baru'
                      : dialog.kind === 'class'
                        ? dialog.item
                          ? 'Ubah kelas'
                          : 'Kelas baru'
                        : dialog.item
                          ? 'Ubah jadwal sesi'
                          : 'Sesi baru'}
                  </Text>
                  {dialog.kind === 'session' ? (
                    <>
                      <Field
                        label="Topik / modul"
                        value={draft.moduleTitle}
                        onChangeText={(moduleTitle) =>
                          setDraft((value) => ({ ...value, moduleTitle }))
                        }
                        placeholder="Contoh: Pengukuran dasar"
                        maxLength={120}
                      />
                      <Field
                        label="Ruang"
                        value={draft.room}
                        onChangeText={(room) => setDraft((value) => ({ ...value, room }))}
                        placeholder="Contoh: Lab 2"
                        maxLength={120}
                      />
                      <Field
                        label={`Tanggal mulai (${dialog.classInfo.timeZone})`}
                        value={draft.date}
                        onChangeText={(date) => setDraft((value) => ({ ...value, date }))}
                        placeholder="YYYY-MM-DD"
                        maxLength={10}
                      />
                      <Field
                        label="Tanggal selesai"
                        value={draft.endDate}
                        onChangeText={(endDate) => setDraft((value) => ({ ...value, endDate }))}
                        placeholder="YYYY-MM-DD"
                        maxLength={10}
                      />
                      <View style={styles.timeRow}>
                        <View style={styles.timeField}>
                          <Field
                            label="Mulai"
                            value={draft.startTime}
                            onChangeText={(startTime) =>
                              setDraft((value) => ({ ...value, startTime }))
                            }
                            placeholder="HH:mm"
                            maxLength={5}
                          />
                        </View>
                        <View style={styles.timeField}>
                          <Field
                            label="Selesai"
                            value={draft.endTime}
                            onChangeText={(endTime) => setDraft((value) => ({ ...value, endTime }))}
                            placeholder="HH:mm"
                            maxLength={5}
                          />
                        </View>
                      </View>
                      <Text style={styles.formHint}>
                        Waktu dikirim sesuai zona kelas. Sesi yang sudah dibuka tidak dapat diubah.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Field
                        label={dialog.kind === 'practicum' ? 'Nama praktikum' : 'Nama kelas'}
                        value={draft.name}
                        onChangeText={(name) => setDraft((value) => ({ ...value, name }))}
                        placeholder={
                          dialog.kind === 'practicum' ? 'Contoh: Fisika Dasar' : 'Contoh: Kelas A'
                        }
                        maxLength={100}
                      />
                      {dialog.kind === 'class' && (
                        <Field
                          label="Zona waktu"
                          value={draft.timeZone}
                          onChangeText={(timeZone) => setDraft((value) => ({ ...value, timeZone }))}
                          placeholder="Asia/Jakarta"
                          autoCapitalize="none"
                        />
                      )}
                    </>
                  )}
                  {dialogError ? (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {dialogError}
                    </Text>
                  ) : null}
                  <View style={styles.modalActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => setDialog(null)}
                      style={styles.cancelButton}
                    >
                      <Text style={styles.cancelButtonText}>Batal</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => void submitForm()}
                      style={[styles.primaryButton, busy && styles.buttonDisabled]}
                    >
                      {busy ? (
                        <ActivityIndicator color={BrandColors.paper} />
                      ) : (
                        <Text style={styles.primaryButtonText}>Simpan</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={BrandColors.muted}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        style={styles.input}
      />
    </View>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={BrandColors.forest} />
      <Text style={styles.description}>{label}</Text>
    </View>
  );
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <View style={styles.emptyCard}>
      <Text accessibilityRole="alert" style={styles.cardTitle}>
        Data belum dapat ditampilkan
      </Text>
      <Text style={styles.description}>{message}</Text>
      <AuthButton title="Coba lagi" onPress={retry} />
    </View>
  );
}

function EmptyCard({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.cardTitle}>{title}</Text>
      {body && <Text style={styles.description}>{body}</Text>}
    </View>
  );
}

function StatusPill({ label, archived }: { label: string; archived: boolean }) {
  return (
    <View style={[styles.statusPill, archived && styles.archivedPill]}>
      <Text style={[styles.statusPillText, archived && styles.archivedPillText]}>{label}</Text>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        danger && styles.smallDangerButton,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.smallButtonText, danger && styles.smallDangerText]}>{label}</Text>
    </Pressable>
  );
}
