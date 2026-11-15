# Jadwal dan navigasi Nandra

## Cakupan

Implementasi mengikuti bagian Nandra di `pembagian-tugas-sprint2.md`:
tab per role, logout di header, jadwal Firestore realtime, filter pengguna,
badge status, loading/error/empty state, dan navigasi ke detail sesi.
Tema dan bentuk kartu diambil dari layar jadwal Sprint 1.
Salinan asli layar yang digantikan tersedia di
[arsip referensi Sprint 1](references/sprint1/README.md); template anggota lain
tetap dipertahankan di lokasi semula.

`useSchedule()` menyediakan `{ sessions, loading, error, retry }`. Identitas dan
role selalu berasal dari `useAuth`, bukan query parameter atau data mock.

## Keanggotaan kelas

Sesuai kesepakatan, tambahkan `studentIds: string[]` pada `classes/{classId}`.
Contoh (ganti UID dengan nilai dari Firebase Authentication):

```json
{
  "name": "IF-3A",
  "practicum": "Basis Data",
  "assistantId": "UID_ASISTEN",
  "studentIds": ["UID_PRAKTIKAN"]
}
```

Praktikan bisa mengikuti beberapa kelas. Kelas tanpa `studentIds` dianggap belum
memiliki peserta. Aplikasi tidak menambahkan peserta saat register dan tidak
membuka pendaftaran kelas mandiri. Pengelolaan kelas/peserta tetap mengikuti
fitur kelas Baihaqi; untuk pengujian awal, data dapat diisi lewat Console.

## Kontrak `sessions/{sessionId}`

Tipe bersama berada di `src/types/session.ts`. ID sesi berasal dari ID dokumen,
bukan field tambahan di dalam dokumen. Contoh untuk kelas dengan ID `kelas-a`:

```json
{
  "classId": "kelas-a",
  "className": "IF-3A",
  "practicum": "Basis Data",
  "module": "Modul 1",
  "room": "Lab 1",
  "date": "2026-11-15",
  "startTime": "08:00",
  "endTime": "10:00",
  "status": "upcoming",
  "assistantId": "UID_ASISTEN",
  "openedAt": null
}
```

- `date`: `YYYY-MM-DD`; waktu mulai/akhir: `HH:mm` dalam WIB.
- `status`: `upcoming`, `open`, atau `closed`.
- `openedAt`: Firestore Timestamp ketika sesi dibuka, atau null.
- Field teks lainnya wajib diisi. Parser menampilkan error jika format tidak sesuai.
- Badge memakai warna/status tema lama melalui pemetaan tiga status di atas.

## Query dan pembaruan

- Asisten: listener `sessions` dengan `assistantId == user.uid`.
- Praktikan: listener `classes` dengan `studentIds array-contains user.uid`,
  lalu listener sesi untuk setiap `classId` yang diikuti.
- Perubahan status, penambahan/penghapusan sesi, dan keanggotaan terlihat tanpa reload.
- Urutan jadwal berdasarkan tanggal, waktu mulai, dan ID; tidak memerlukan indeks komposit baru.
- Pergantian akun/role membersihkan listener. Callback lama diabaikan;
  keanggotaan yang dicabut juga menghapus data sesi dari tampilan.
- Query dilakukan per kelas sehingga pemeriksaan role dan keanggotaan dalam
  Rules tidak perlu membaca banyak dokumen kelas sekaligus dalam satu query.

## Rute integrasi anggota lain

| Tujuan | Rute | Pemilik fitur |
| --- | --- | --- |
| Detail/kelola sesi | `/(app)/asisten/sesi?sessionId=...` | Baihaqi |
| Daftar izin | `/(app)/asisten/izin` | Rio |
| Detail/presensi | `/(app)/praktikan/presensi?sessionId=...` | Danendra |
| Riwayat pribadi | `/(app)/praktikan/riwayat` | Rio |

File pada rute tersebut hanya penghubung navigasi yang telah disepakati,
menampilkan "Fitur ini belum tersedia". Belum ada pembacaan/penulisan data fitur
mereka di penghubung ini. Saat integrasi, pemilik fitur mengganti isi rute dengan
implementasinya sendiri, menggunakan `sessionId`, `useAuth`, dan Firebase bersama.
Layar mock Sprint 1 tidak dipakai sebagai pengganti fitur cloud mereka.

Rute detail disembunyikan dari tombol tab. Route guard membatasi rute asisten
dan praktikan sesuai role. `/` tetap tersedia sebagai pintu masuk auth;
`/home` adalah alias kompatibilitas yang mengarah ke `/jadwal`.

## Rules dan uji HP

Terapkan `firestore.rules` terbaru lewat Console sebelum uji. Rules menyediakan
baca kelas/sesi sesuai pemilik atau keanggotaan; operasi CRUD kelas/sesi tetap
ditolak sampai aturan pemilik fitur tersebut diintegrasikan. Jangan membuka
baca semua sesi untuk mengatasi error izin.

1. Jalankan `npx expo start --dev-client`, lalu reload penuh development APK.
2. Login sebagai asisten: periksa tab Jadwal/Daftar Izin dan tombol keluar di header.
3. Isi kelas/sesi contoh di Console memakai UID akun uji; sesi milik asisten lain tidak boleh muncul.
4. Login sebagai praktikan: periksa tab Jadwal Saya/Riwayat Saya dan jadwal kelasnya.
5. Ubah status sesi di Console: badge berubah tanpa reload.
6. Hapus UID praktikan dari `studentIds`: sesi kelas tersebut hilang tanpa reload.
7. Akun tanpa kelas/sesi menampilkan empty state, bukan error atau data pengguna lain.
8. Klik sesi: rute detail sesuai role menerima ID dokumen sesi yang benar.
9. Logout, login ulang, dan buka URL `/`: tidak terjadi loop atau unmatched route.

Unit test: `node --test tests/*.test.cjs`. Test memakai SDK palsu untuk listener
dan memakai router Expo terpasang untuk pencocokan/guard/transisi rute.
Test tersebut bukan pengganti uji Firebase cloud atau perangkat fisik.
