import { router, useLocalSearchParams } from 'expo-router';
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
import type { StudentCandidate } from '@/lib/roster';
import {
  useAssistantClasses,
  useClassRoster,
  useClassSessions,
} from '@/features/academic/useAcademic';
import type { AcademicClass, AcademicSession } from '@/features/academic/types';
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
  | { kind: 'class'; item?: AcademicClass }
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
  return <AssistantPracticumScreen classDetail={false} />;
}

export function AssistantClassRoute() {
  return <AssistantPracticumScreen classDetail />;
}

function AssistantPracticumScreen({ classDetail }: { classDetail: boolean }) {
  const insets = useSafeAreaInsets();
  const { user, role } = useAuth();
  const uid = user?.uid;
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  const [classTab, setClassTab] = useState<'Peserta' | 'Sesi'>('Peserta');
  const classesState = useAssistantClasses();
  const classes = classesState.value;
  const selectedClass = classDetail ? (classes.find((item) => item.id === classId) ?? null) : null;
  const rosterState = useClassRoster(uid, selectedClass?.id ?? null);
  const sessionsState = useClassSessions(selectedClass);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [screenMessage, setScreenMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchByName, setSearchByName] = useState(false);
  const [studentMatches, setStudentMatches] = useState<{
    classId: string;
    students: StudentCandidate[];
  } | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [lookingUpStudent, setLookingUpStudent] = useState(false);
  const formLock = useRef(false);
  const confirmLock = useRef(false);
  const rosterLock = useRef(false);

  function openClass(classId: string) {
    router.push({ pathname: '/asisten/kelas', params: { classId } });
  }

  function openSession({ classId, id }: AcademicSession, section?: 'ulasan') {
    router.push({ pathname: '/asisten/sesi', params: { classId, sessionId: id, section } });
  }

  function openClassForm(item?: AcademicClass) {
    setDraft({
      ...EMPTY_DRAFT,
      name: item?.name ?? '',
      timeZone: item?.timeZone ?? 'Asia/Jakarta',
      requestId: newRequestId(),
    });
    setDialogError(null);
    setDialog({ kind: 'class', item });
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
      let createdClassId: string | undefined;
      if (dialog.kind === 'class') {
        const { name, timeZone } = draft;
        if (dialog.item) await mutate('updateClass', { classId: dialog.item.id, name, timeZone });
        else {
          const { id } = await mutate<{ id: string }>('createClass', {
            name,
            timeZone,
            requestId: draft.requestId,
          });
          createdClassId = id;
        }
      } else {
        const { moduleTitle, room } = draft;
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
        const schedule = { classId: dialog.classInfo.id, moduleTitle, room, startsAt, endsAt };
        if (dialog.item) {
          await mutate('updateSession', { ...schedule, sessionId: dialog.item.id });
        } else {
          await mutate('createSession', { ...schedule, requestId: draft.requestId });
        }
      }
      setDialog(null);
      if (createdClassId) openClass(createdClassId);
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

  function confirmStudent(candidate: StudentCandidate) {
    if (!selectedClass) return;
    const { id: classId, name: className } = selectedClass;
    const { displayName, nim } = candidate;
    askForConfirmation(
      'Tambah peserta?',
      `${displayName} (NIM ${nim}) akan ditambahkan ke kelas ${className}.`,
      'Tambah peserta',
      async () => {
        await mutate('addStudent', { classId, ...candidate });
        setSearchInput('');
        setStudentMatches(null);
      },
      false,
    );
  }

  async function findStudent() {
    const term = searchInput.trim();
    if (!selectedClass || !term || rosterLock.current) return;

    const { id: classId } = selectedClass;
    rosterLock.current = true;
    setLookingUpStudent(true);
    setRosterError(null);
    setStudentMatches(null);
    try {
      if (searchByName) {
        const students = await mutate<StudentCandidate[]>('lookupStudentsByName', {
          classId,
          name: term,
        });
        if (students.length) setStudentMatches({ classId, students });
        else setRosterError('Tidak ada praktikan aktif dengan nama lengkap tersebut.');
        return;
      }
      const candidate = await mutate<{
        studentUid: string | null;
        displayName: string | null;
        nim: string | null;
      }>('lookupStudent', { classId, nim: term });
      const { studentUid, displayName, nim } = candidate;
      if (!studentUid || !displayName || !nim) {
        setRosterError('Tidak ada akun praktikan aktif dengan NIM tersebut.');
        return;
      }
      confirmStudent({ studentUid, displayName, nim });
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
        key={classDetail ? classTab : 'classes'}
        contentContainerStyle={[
          styles.content,
          { paddingTop: (classDetail ? insets.top : 0) + 16, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {classDetail ? (
          <Pressable
            accessibilityRole="button"
            style={styles.backButton}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/asisten/praktikum');
            }}
          >
            <Text style={styles.linkText}>‹ Daftar kelas</Text>
          </Pressable>
        ) : (
          <Text accessibilityRole="header" style={styles.title}>
            Kelas Praktikum
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

        {!classDetail && (
          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              onPress={() => openClassForm()}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Buat kelas praktikum</Text>
            </Pressable>
            {classesState.loading ? (
              <Loading label="Memuat kelas..." />
            ) : classesState.error ? (
              <LoadError message={classesState.error} retry={classesState.retry} />
            ) : classes.length === 0 ? (
              <EmptyCard
                title="Belum ada kelas praktikum"
                body="Buat kelas untuk menambahkan peserta dan menjadwalkan sesi."
              />
            ) : (
              classes.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={'Buka kelas ' + item.name}
                  onPress={() => openClass(item.id)}
                  style={styles.resourceCard}
                >
                  <View style={styles.resourceTop}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <StatusPill
                      label={item.status === 'active' ? 'Aktif' : 'Diarsipkan'}
                      archived={item.status === 'archived'}
                    />
                  </View>
                  <Text style={styles.description}>
                    {item.unfinishedSessionCount} sesi belum selesai
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        )}

        {classDetail &&
          !selectedClass &&
          (classesState.loading ? (
            <Loading label="Memuat kelas..." />
          ) : classesState.error ? (
            <LoadError message={classesState.error} retry={classesState.retry} />
          ) : (
            <EmptyCard title="Kelas tidak ditemukan" />
          ))}

        {selectedClass ? (
          <>
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.title}>
                {selectedClass.name}
              </Text>
              {selectedClass.status === 'active' && (
                <View style={styles.resourceActions}>
                  <SmallButton label="Ubah kelas" onPress={() => openClassForm(selectedClass)} />
                  <SmallButton
                    label="Arsipkan"
                    danger
                    onPress={() => requestArchiveClass(selectedClass)}
                  />
                </View>
              )}
            </View>
            <View accessibilityRole="tablist" style={styles.classTabs}>
              {(['Peserta', 'Sesi'] as const).map((tab) => (
                <Pressable
                  key={tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: classTab === tab }}
                  onPress={() => setClassTab(tab)}
                  style={[styles.classTab, classTab === tab && styles.classTabSelected]}
                >
                  <Text
                    style={[styles.classTabText, classTab === tab && styles.classTabTextSelected]}
                  >
                    {tab}
                  </Text>
                </Pressable>
              ))}
            </View>
            {classTab === 'Peserta' ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>
                      Peserta kelas
                    </Text>
                    {rosterState.value.length > 0 && (
                      <Text style={styles.description}>
                        {rosterState.value.length} peserta aktif
                      </Text>
                    )}
                  </View>
                </View>
                {selectedClass.status === 'active' && (
                  <>
                    <View style={styles.addStudentRow}>
                      <TextInput
                        accessibilityLabel={
                          searchByName ? 'Cari berdasarkan nama lengkap' : 'Cari berdasarkan NIM'
                        }
                        value={searchInput}
                        onChangeText={(value) => {
                          setSearchInput(value);
                          setStudentMatches(null);
                          setRosterError(null);
                        }}
                        placeholder={searchByName ? 'Nama lengkap' : 'NIM praktikan'}
                        placeholderTextColor={BrandColors.muted}
                        autoCapitalize={searchByName ? 'words' : 'characters'}
                        editable={!lookingUpStudent}
                        maxLength={searchByName ? 100 : 30}
                        returnKeyType="search"
                        onSubmitEditing={() => void findStudent()}
                        style={[styles.input, styles.nimInput]}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={!searchInput.trim() || lookingUpStudent}
                        onPress={() => void findStudent()}
                        style={[
                          styles.primaryButton,
                          (!searchInput.trim() || lookingUpStudent) && styles.buttonDisabled,
                        ]}
                      >
                        {lookingUpStudent ? (
                          <ActivityIndicator color={BrandColors.paper} />
                        ) : (
                          <Text style={styles.primaryButtonText}>Cari</Text>
                        )}
                      </Pressable>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={lookingUpStudent}
                      onPress={() => {
                        setSearchByName(!searchByName);
                        setSearchInput('');
                        setRosterError(null);
                        setStudentMatches(null);
                      }}
                    >
                      <Text style={styles.linkText}>
                        {searchByName ? 'Cari berdasarkan NIM' : 'Cari berdasarkan nama lengkap'}
                      </Text>
                    </Pressable>
                    {studentMatches?.classId === selectedClass.id &&
                      studentMatches.students.map((student) => (
                        <View key={student.studentUid} style={styles.rosterRow}>
                          <View style={styles.rosterIdentity}>
                            <Text style={styles.cardTitle}>{student.displayName}</Text>
                            <Text style={styles.description}>NIM {student.nim}</Text>
                          </View>
                          <SmallButton label="Pilih" onPress={() => confirmStudent(student)} />
                        </View>
                      ))}
                  </>
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
            ) : (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text accessibilityRole="header" style={styles.sectionTitle}>
                      Jadwal sesi
                    </Text>
                    <Text style={styles.description}>{selectedClass.timeZone}</Text>
                  </View>
                  {selectedClass.status === 'active' && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openSessionForm(selectedClass)}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Buat sesi</Text>
                    </Pressable>
                  )}
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
                            onPress={() => openSession(session)}
                          />
                          {session.status === 'closed' && (
                            <SmallButton
                              label="Ulasan & AI"
                              onPress={() => openSession(session, 'ulasan')}
                            />
                          )}
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
            )}
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
                    {dialog.kind === 'class'
                      ? dialog.item
                        ? 'Ubah kelas praktikum'
                        : 'Kelas praktikum baru'
                      : dialog.item
                        ? 'Ubah jadwal sesi'
                        : 'Sesi baru'}
                  </Text>
                  {dialog.kind === 'session' ? (
                    <>
                      <Text style={styles.description}>{dialog.classInfo.name}</Text>
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
                        label="Nama kelas praktikum"
                        value={draft.name}
                        onChangeText={(name) => setDraft((value) => ({ ...value, name }))}
                        placeholder="Contoh: Basis Data B"
                        maxLength={100}
                      />
                      <Field
                        label="Zona waktu"
                        value={draft.timeZone}
                        onChangeText={(timeZone) => setDraft((value) => ({ ...value, timeZone }))}
                        placeholder="Asia/Jakarta"
                        autoCapitalize="none"
                      />
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
