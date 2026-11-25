import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LabSelect } from '@/features/labs/lab-select';
import { AuthButton } from '@/components/auth-screen';
import {
  BottomSheetModal,
  CornerDotAccent,
  DarkContourOverlay,
  DarkGradientOverlay,
  ScreenBackdrop,
} from '@/components/labsync-brand';
import { BrandColors, SessionStatusStyles } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { mutationError, mutate, newRequestId } from '@/lib/mutations';
import type { StudentCandidate } from '@/lib/roster';
import {
  classLocalDateTime,
  formatSessionRange,
  zonedDateTimeToEpochMs,
} from '@/features/academic/time';
import type { AcademicClass, AcademicSession } from '@/features/academic/types';
import {
  useAssistantClasses,
  useClassRoster,
  useClassSessions,
} from '@/features/academic/useAcademic';

import { DatePickerField, TimePickerField, TimePickerPanel } from './date-time-pickers';
import { styles } from './assistant-practicum.styles';

const ARROW_BACK_LIGHT = require('../../../assets/images/arrow-back-light.svg');

type Draft = {
  name: string;
  timeZone: string;
  moduleTitle: string;
  room: string;
  labId: string;
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
  labId: '',
  date: '',
  endDate: '',
  startTime: '',
  endTime: '',
  requestId: '',
};

function formatStartDate(session: AcademicSession) {
  try {
    return session.startsAt.toDate().toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: session.timeZone,
    });
  } catch {
    return session.date;
  }
}

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
  const [activeTimePicker, setActiveTimePicker] = useState<'start' | 'end' | null>(null);
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

  function openClass(targetClassId: string) {
    router.push({ pathname: '/asisten/kelas', params: { classId: targetClassId } });
  }

  function openSession({ classId: targetClassId, id }: AcademicSession, section?: 'ulasan') {
    router.push({
      pathname: '/asisten/sesi',
      params: { classId: targetClassId, sessionId: id, section },
    });
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
    const todayDate = classLocalDateTime(new Date(), classInfo.timeZone).date;
    const defaultDate = item?.date ?? todayDate;
    setDraft({
      ...EMPTY_DRAFT,
      moduleTitle: item?.module ?? '',
      room: item?.room ?? '',
      labId: item?.labId ?? '',
      date: defaultDate,
      endDate: defaultDate,
      startTime: item?.startTime ?? '08:00',
      endTime: item?.endTime ?? '10:00',
      requestId: newRequestId(),
    });
    setActiveTimePicker(null);
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
        if (!draft.labId.trim()) throw new Error('Pilih laboratorium terlebih dahulu.');
        const { moduleTitle, room } = draft;
        const startsAt = zonedDateTimeToEpochMs(
          draft.date,
          draft.startTime,
          dialog.classInfo.timeZone,
        );
        const endsAt = zonedDateTimeToEpochMs(draft.date, draft.endTime, dialog.classInfo.timeZone);
        const schedule = {
          classId: dialog.classInfo.id,
          moduleTitle,
          room,
          startsAt,
          endsAt,
          labId: draft.labId,
        };
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
    const { id: targetClassId, name: className } = selectedClass;
    const { displayName, nim } = candidate;
    askForConfirmation(
      'Tambah peserta?',
      `${displayName} (NIM ${nim}) akan ditambahkan ke kelas ${className}.`,
      'Tambah peserta',
      async () => {
        await mutate('addStudent', { classId: targetClassId, ...candidate });
        setSearchInput('');
        setStudentMatches(null);
      },
      false,
    );
  }

  async function findStudent() {
    const term = searchInput.trim();
    if (!selectedClass || !term || rosterLock.current) return;

    const { id: targetClassId } = selectedClass;
    rosterLock.current = true;
    setLookingUpStudent(true);
    setRosterError(null);
    setStudentMatches(null);
    try {
      if (searchByName) {
        const students = await mutate<StudentCandidate[]>('lookupStudentsByName', {
          classId: targetClassId,
          name: term,
        });
        if (students.length) setStudentMatches({ classId: targetClassId, students });
        else setRosterError('Tidak ada praktikan aktif dengan nama lengkap tersebut.');
        return;
      }
      const candidate = await mutate<{
        studentUid: string | null;
        displayName: string | null;
        nim: string | null;
      }>('lookupStudent', { classId: targetClassId, nim: term });
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

  const dialogTitle = !dialog
    ? ''
    : dialog.kind === 'confirm'
      ? dialog.title
      : dialog.kind === 'class'
        ? dialog.item
          ? 'Ubah kelas praktikum'
          : 'Kelas praktikum baru'
        : dialog.item
          ? 'Ubah jadwal sesi'
          : 'Sesi baru';

  const dialogSubtitle = dialog?.kind === 'session' ? dialog.classInfo.name : undefined;

  return (
    <View style={styles.screen}>
      {classDetail ? <StatusBar style="light" /> : null}
      <ScreenBackdrop variant="topo" />
      <ScrollView
        key={classDetail ? classTab : 'classes'}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          classDetail
            ? [styles.detailScrollContent, { paddingBottom: insets.bottom + 32 }]
            : [styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 106 }]
        }
        keyboardShouldPersistTaps="handled"
      >
        {classDetail ? (
          <View style={[styles.darkBand, { paddingTop: insets.top + 12 }]}>
            <DarkGradientOverlay />
            <DarkContourOverlay />
            <View style={styles.darkBandTop}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kembali ke daftar kelas"
                style={({ pressed }) => [styles.backCircle, pressed && styles.pressed]}
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace('/asisten/praktikum');
                }}
              >
                <Image
                  source={ARROW_BACK_LIGHT}
                  contentFit="contain"
                  accessible={false}
                  style={styles.backIcon}
                />
              </Pressable>
            </View>
            {selectedClass ? (
              <View style={styles.darkHeaderRow}>
                <View style={styles.darkInfo}>
                  <Text accessibilityRole="header" style={styles.darkTitle}>
                    {selectedClass.name}
                  </Text>
                  <Text style={styles.darkSub}>
                    {selectedClass.unfinishedSessionCount} sesi belum selesai
                  </Text>
                </View>
                {selectedClass.status === 'active' ? (
                  <View style={styles.darkActions}>
                    <SmallButton label="Ubah" onDark onPress={() => openClassForm(selectedClass)} />
                    <SmallButton
                      label="Arsipkan"
                      danger
                      icon="alert"
                      onPress={() => requestArchiveClass(selectedClass)}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={classDetail ? styles.detailBody : styles.section}>
          {!classDetail ? (
            <AuthButton
              title="Kelola laboratorium"
              variant="outline"
              onPress={() => router.push('/asisten/lab')}
            />
          ) : null}
          {screenMessage ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{screenMessage}</Text>
              <Pressable accessibilityRole="button" onPress={() => setScreenMessage(null)}>
                <Text style={styles.dismissText}>Tutup</Text>
              </Pressable>
            </View>
          ) : null}

          {!classDetail ? (
            <View style={styles.section}>
              <Pressable
                accessibilityRole="button"
                onPress={() => openClassForm()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>+ Kelas praktikum baru</Text>
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
                classes.map((item, idx) => {
                  const isActive = item.status === 'active';
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={'Buka kelas ' + item.name}
                      onPress={() => openClass(item.id)}
                      style={({ pressed }) => [
                        styles.resourceCard,
                        isActive && styles.resourceCardActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      {isActive && idx === 0 ? <CornerDotAccent /> : null}
                      <View style={styles.resourceTop}>
                        <View style={styles.indexBadge}>
                          <Text style={styles.indexEyebrow}>
                            {String(idx + 1).padStart(2, '0')}
                          </Text>
                        </View>
                        <StatusPill
                          label={isActive ? 'Aktif' : 'Diarsipkan'}
                          archived={!isActive}
                        />
                      </View>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <Text style={styles.description}>
                        {item.unfinishedSessionCount} sesi belum selesai
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : null}

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
              <View accessibilityRole="tablist" style={styles.classTabs}>
                {(['Peserta', 'Sesi'] as const).map((tab) => {
                  const count =
                    tab === 'Peserta'
                      ? !rosterState.loading
                        ? rosterState.value.length
                        : null
                      : !sessionsState.loading
                        ? sessionsState.value.length
                        : null;
                  return (
                    <Pressable
                      key={tab}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: classTab === tab }}
                      onPress={() => setClassTab(tab)}
                      style={[styles.classTab, classTab === tab && styles.classTabSelected]}
                    >
                      <Text
                        style={[
                          styles.classTabText,
                          classTab === tab && styles.classTabTextSelected,
                        ]}
                      >
                        {count !== null ? `${tab} (${count})` : tab}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {classTab === 'Peserta' ? (
                <View style={styles.section}>
                  {selectedClass.status === 'active' ? (
                    <View style={styles.addStudentCard}>
                      <View style={styles.addStudentRow}>
                        <View style={styles.searchInputWrap}>
                          <SymbolView
                            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                            size={16}
                            tintColor={BrandColors.muted}
                          />
                          <TextInput
                            accessibilityLabel={
                              searchByName
                                ? 'Cari berdasarkan nama lengkap'
                                : 'Cari berdasarkan NIM'
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
                            style={styles.searchInput}
                          />
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          disabled={!searchInput.trim() || lookingUpStudent}
                          onPress={() => void findStudent()}
                          style={[
                            styles.searchButton,
                            (!searchInput.trim() || lookingUpStudent) && styles.buttonDisabled,
                          ]}
                        >
                          {lookingUpStudent ? (
                            <ActivityIndicator size="small" color={BrandColors.paper} />
                          ) : (
                            <Text style={styles.searchButtonText}>Cari</Text>
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
                      {studentMatches?.classId === selectedClass.id
                        ? studentMatches.students.map((student) => (
                            <View key={student.studentUid} style={styles.rosterRow}>
                              <View style={styles.rosterIdentity}>
                                <Text style={styles.cardTitle}>{student.displayName}</Text>
                                <Text style={styles.description}>NIM {student.nim}</Text>
                              </View>
                              <SmallButton label="Pilih" onPress={() => confirmStudent(student)} />
                            </View>
                          ))
                        : null}
                      {rosterError ? (
                        <Text accessibilityRole="alert" style={styles.errorText}>
                          {rosterError}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {rosterState.loading ? (
                    <Loading label="Memuat peserta..." />
                  ) : rosterState.error ? (
                    <LoadError message={rosterState.error} retry={rosterState.retry} />
                  ) : rosterState.value.length === 0 ? (
                    <EmptyCard title="Belum ada peserta" />
                  ) : (
                    <View style={styles.rosterCard}>
                      {rosterState.value.map((student, idx) => (
                        <View
                          key={student.id}
                          style={[styles.rosterRow, idx > 0 && styles.rosterDivider]}
                        >
                          <View style={styles.rosterLeft}>
                            <Text style={styles.rowNumber}>{String(idx + 1).padStart(2, '0')}</Text>
                            <View style={styles.rosterIdentity}>
                              <Text style={styles.studentName}>{student.studentNameSnapshot}</Text>
                              <Text style={styles.description}>NIM {student.nimSnapshot}</Text>
                            </View>
                          </View>
                          {selectedClass.status === 'active' ? (
                            <SmallButton
                              label="Keluarkan"
                              danger
                              icon="trash"
                              onPress={() =>
                                requestRemoveStudent(
                                  student.studentUid,
                                  student.studentNameSnapshot,
                                )
                              }
                            />
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.section}>
                  {selectedClass.status === 'active' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openSessionForm(selectedClass)}
                      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.primaryButtonText}>+ Sesi baru</Text>
                    </Pressable>
                  ) : null}
                  {sessionsState.loading ? (
                    <Loading label="Memuat sesi..." />
                  ) : sessionsState.error ? (
                    <LoadError message={sessionsState.error} retry={sessionsState.retry} />
                  ) : sessionsState.value.length === 0 ? (
                    <EmptyCard title="Belum ada sesi" />
                  ) : (
                    sessionsState.value.map((session) => {
                      const badge = SessionStatusStyles[session.status];
                      const isOpen = session.status === 'open';
                      const dateLabel = formatStartDate(session);
                      const timeLabel = `${session.startTime} – ${session.endTime}`;
                      return (
                        <View key={session.id} style={styles.sessionCard}>
                          <View style={styles.resourceTop}>
                            <Text style={styles.cardTitle}>{session.module}</Text>
                            <View
                              style={[
                                styles.statusPill,
                                { backgroundColor: badge.bg, borderColor: badge.border },
                              ]}
                            >
                              <Text style={[styles.statusPillText, { color: badge.text }]}>
                                {isOpen ? `● ${badge.label}` : badge.label}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.metaList}>
                            <View style={styles.metaIconRow}>
                              <SymbolView
                                name={{
                                  ios: 'calendar',
                                  android: 'calendar_today',
                                  web: 'calendar_today',
                                }}
                                size={13}
                                tintColor={BrandColors.muted}
                              />
                              <Text style={styles.description}>{dateLabel}</Text>
                            </View>
                            <View style={styles.metaIconRow}>
                              <SymbolView
                                name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
                                size={13}
                                tintColor={BrandColors.muted}
                              />
                              <Text style={styles.description}>{timeLabel}</Text>
                            </View>
                            <View style={styles.metaIconRow}>
                              <SymbolView
                                name={{ ios: 'mappin.and.ellipse', android: 'place', web: 'place' }}
                                size={13}
                                tintColor={BrandColors.muted}
                              />
                              <Text style={styles.description}>Ruang {session.room}</Text>
                            </View>
                          </View>
                          <View style={styles.resourceActions}>
                            <SmallButton
                              label="Rekap & detail"
                              onPress={() => openSession(session)}
                            />
                            {session.status === 'scheduled' ? (
                              <>
                                <SmallButton
                                  label="Ubah jadwal"
                                  onPress={() => openSessionForm(selectedClass, session)}
                                />
                                <SmallButton
                                  label="Batalkan"
                                  danger
                                  icon="alert"
                                  onPress={() => requestCancelSession(session)}
                                />
                              </>
                            ) : null}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>

      <BottomSheetModal
        visible={!!dialog}
        title={dialogTitle}
        subtitle={dialogSubtitle}
        danger={dialog?.kind === 'confirm' && dialog.destructive}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
      >
        {dialog?.kind === 'confirm' ? (
          <>
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
                  dialog.destructive ? styles.dangerButton : styles.modalConfirmPrimary,
                  busy && styles.buttonDisabled,
                ]}
              >
                {busy ? (
                  <ActivityIndicator
                    color={dialog.destructive ? BrandColors.ink : BrandColors.paper}
                  />
                ) : (
                  <Text
                    style={dialog.destructive ? styles.dangerButtonText : styles.primaryButtonText}
                  >
                    {dialog.label}
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        ) : dialog ? (
          <>
            {dialog.kind === 'session' ? (
              <>
                <Field
                  label="Topik / modul"
                  value={draft.moduleTitle}
                  onChangeText={(moduleTitle) => setDraft((value) => ({ ...value, moduleTitle }))}
                  placeholder="Contoh: Pengukuran dasar"
                  maxLength={120}
                />
                <LabSelect
                  labId={draft.labId}
                  onChange={(location) => setDraft((value) => ({ ...value, ...location }))}
                />
                <DatePickerField
                  label="Tanggal"
                  value={draft.date}
                  onChange={(date) => {
                    setDraft((value) => ({ ...value, date, endDate: date }));
                  }}
                />
                <View style={styles.timeRow}>
                  <View style={styles.timeField}>
                    <TimePickerField
                      label="Mulai"
                      value={draft.startTime}
                      open={activeTimePicker === 'start'}
                      onToggle={() =>
                        setActiveTimePicker((prev) => (prev === 'start' ? null : 'start'))
                      }
                    />
                  </View>
                  <View style={styles.timeField}>
                    <TimePickerField
                      label="Selesai"
                      value={draft.endTime}
                      open={activeTimePicker === 'end'}
                      onToggle={() =>
                        setActiveTimePicker((prev) => (prev === 'end' ? null : 'end'))
                      }
                    />
                  </View>
                </View>
                {activeTimePicker === 'start' ? (
                  <TimePickerPanel
                    title="Pilih jam mulai"
                    value={draft.startTime}
                    onChange={(startTime) => setDraft((value) => ({ ...value, startTime }))}
                    onDone={() => setActiveTimePicker(null)}
                  />
                ) : null}
                {activeTimePicker === 'end' ? (
                  <TimePickerPanel
                    title="Pilih jam selesai"
                    value={draft.endTime}
                    onChange={(endTime) => setDraft((value) => ({ ...value, endTime }))}
                    onDone={() => setActiveTimePicker(null)}
                  />
                ) : null}
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
                style={[styles.modalConfirmPrimary, busy && styles.buttonDisabled]}
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
      </BottomSheetModal>
    </View>
  );
}

function StatusPill({ label, archived }: { label: string; archived: boolean }) {
  return (
    <View
      style={[
        styles.statusPill,
        {
          backgroundColor: archived ? BrandColors.soft : BrandColors.ink,
          borderColor: archived ? BrandColors.line : BrandColors.ink,
        },
      ]}
    >
      <Text
        style={[styles.statusPillText, { color: archived ? BrandColors.muted : BrandColors.paper }]}
      >
        {label}
      </Text>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  danger = false,
  onDark = false,
  icon,
  flex = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  onDark?: boolean;
  icon?: 'trash' | 'alert';
  flex?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        flex && styles.smallButtonFlex,
        onDark && styles.smallButtonOnDark,
        danger && styles.smallButtonDanger,
        pressed && styles.pressed,
      ]}
    >
      {icon === 'trash' ? (
        <SymbolView
          name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }}
          size={13}
          tintColor={BrandColors.danger}
        />
      ) : icon === 'alert' ? (
        <SymbolView
          name={{
            ios: 'exclamationmark.triangle',
            android: 'warning_amber',
            web: 'warning_amber',
          }}
          size={13}
          tintColor={BrandColors.danger}
        />
      ) : null}
      <Text style={[styles.smallButtonText, onDark && styles.smallButtonTextOnDark]}>{label}</Text>
    </Pressable>
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
  placeholder?: string;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
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

function EmptyCard({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.cardTitle}>{title}</Text>
      {body ? <Text style={styles.description}>{body}</Text> : null}
    </View>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator color={BrandColors.ink} />
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
