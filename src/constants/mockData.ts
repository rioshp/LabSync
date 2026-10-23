export type Role = 'asisten' | 'praktikan';

export type SessionStatus = 'BELUM_DIBUKA' | 'DIBUKA' | 'DITUTUP';

export interface User {
  id: string;
  nama: string;
  nim: string;
  peran: Role;
}

export interface PracticumSession {
  id: string;
  namaPraktikum: string;
  modul: string;
  kelas: string;
  waktu: string;
  ruangan: string;
  status: SessionStatus;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  namaPraktikum: string;
  kelas: string;
  namaPraktikan: string;
  nim: string;
  waktuHadir: string;
  keterangan?: string;
}

export const MOCK_USERS: User[] = [
  { id: 'ast-1', nama: 'Raka Pratama', nim: '210101001', peran: 'asisten' },
  { id: 'ast-2', nama: 'Nadya Putri', nim: '210101002', peran: 'asisten' },
  { id: 'prk-1', nama: 'Budi Santoso', nim: '220101010', peran: 'praktikan' },
  { id: 'prk-2', nama: 'Siti Aminah', nim: '220101011', peran: 'praktikan' },
  { id: 'prk-3', nama: 'Dimas Anggara', nim: '220101012', peran: 'praktikan' },
];

export const MOCK_SESSIONS: PracticumSession[] = [
  {
    id: 'sesi-1',
    namaPraktikum: 'Pemrograman Perangkat Bergerak',
    modul: 'Modul 1 - Layout Flexbox & Navigasi',
    kelas: 'PPK - Kelas A',
    waktu: 'Jumat, 08:00 - 10:00 WIB',
    ruangan: 'Lab Komputer 1',
    status: 'BELUM_DIBUKA',
  },
  {
    id: 'sesi-2',
    namaPraktikum: 'Pemrograman Perangkat Bergerak',
    modul: 'Modul 1 - Layout Flexbox & Navigasi',
    kelas: 'PPK - Kelas B',
    waktu: 'Jumat, 10:00 - 12:00 WIB',
    ruangan: 'Lab Komputer 2',
    status: 'DIBUKA',
  },
  {
    id: 'sesi-3',
    namaPraktikum: 'Basis Data Lanjut',
    modul: 'Modul 2 - Optimasi Query',
    kelas: 'BDL - Kelas A',
    waktu: 'Kamis, 13:00 - 15:00 WIB',
    ruangan: 'Lab Basis Data',
    status: 'DITUTUP',
  },
];

export const MOCK_ATTENDANCES: AttendanceRecord[] = [
  {
    id: 'att-1',
    sessionId: 'sesi-2',
    namaPraktikum: 'Pemrograman Perangkat Bergerak',
    kelas: 'PPK - Kelas B',
    namaPraktikan: 'Siti Aminah',
    nim: '220101011',
    waktuHadir: '10:04:12 WIB',
    keterangan: 'Hadir di Meja 04',
  },
];
