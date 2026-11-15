# Kontrak akun Sprint 2

## Batas perubahan Nandra

Bagian Nandra mencakup Firebase bersama, `useAuth`, login/register, validasi profil,
auth guard, tab sesuai role, logout di header, dan jadwal realtime. Komponen,
tipe data, dokumentasi, dan tes mendukung bagian tersebut.

Rules mencakup profil `users/{uid}` serta baca kelas/sesi sesuai role dan
keanggotaan. Operasi tulis fitur lain tetap memerlukan aturan dari pemilik fitur.
Panel asisten/praktikan, CRUD kelas/sesi, presensi, rekap, izin, AI, ulasan, dan
riwayat tidak diimplementasikan di sini. Rute penghubung disediakan sesuai
kesepakatan; kode layar lama anggota lain tidak diubah. Konstanta tema bersama tetap sama.
Lihat [kontrak jadwal dan integrasi](schedule.md).

## Modul bersama

- Firebase native: `auth` dan `db` dari `@/lib/firebase`.
- Status akun: `useAuth` dari `@/hooks/useAuth`, di dalam `AuthProvider`.
- Tipe profil: `Role` dan `UserProfile` dari `@/types/user`.
- Login/register/logout: `login`, `register`, dan `logout` dari `@/lib/auth`.

## Pemisahan file

| Lokasi | Tanggung jawab |
| --- | --- |
| `src/app/` | Halaman dan layout navigasi sesuai bagian Nandra |
| `src/hooks/useAuth.ts` | AuthProvider, listener akun/profil, dan hook status akun |
| `src/lib/firebase.ts` | Instance Firebase bersama |
| `src/lib/auth.ts` | Operasi akun, validasi internal, parser profil, dan pesan error |
| `src/types/user.ts` | Tipe `Role` dan `UserProfile`, tanpa kode runtime |
| `src/components/auth-screen.tsx` | Tampilan bersama, background, dan animasi tema lama |
| `src/components/auth-session-status.tsx` | Tampilan loading dan pemulihan akun/profil |
| `src/hooks/useSchedule.ts` | State loading/error/retry jadwal dan pembersihan listener |
| `src/lib/schedule.ts` | Query realtime kelas/sesi dan parser data jadwal |
| `src/types/session.ts` | Kontrak sesi Firestore |
| `src/components/logout-button.tsx` | Tombol keluar pada header tab |

File helper mendukung implementasi Nandra; tidak menggantikan halaman atau
fitur milik anggota lain. Validator form hanya dipakai internal oleh operasi akun.

`useAuth()` mengembalikan `{ user, role, profile, loading, error, retry }`.
`user.uid` adalah identitas Firebase Auth. `role` berasal dari profil Firestore,
bukan parameter navigasi. Selama loading atau jika profil tidak tersedia/valid,
`profile` dan `role` bernilai `null`; jangan memberi akses berdasarkan `user` saja.
Listener akun dan profil dibersihkan ketika akun berganti atau provider dilepas.
Profil lokal yang belum dikonfirmasi Firestore tidak digunakan untuk masuk aplikasi.

Konfigurasi Expo saat ini juga mengekspor server. Pada layar yang dievaluasi saat
build, muat modul native di effect/handler dengan `await import('@/lib/firebase')`,
seperti pada `useAuth` dan fungsi login/register. Jangan menginisialisasi default
app kedua: Android sudah membacanya dari `google-services.json`.

## Skema `users/{uid}`

ID dokumen **harus sama** dengan Firebase Auth UID. Jangan membuat ID acak.

| Field | Tipe | Ketentuan |
| --- | --- | --- |
| `name` | string | Nama yang sudah di-trim, 1–100 karakter |
| `role` | `asisten` atau `praktikan` | Dipilih ketika register, dibaca dari profil ketika login |
| `nim` | string | Wajib untuk praktikan, 1–30 karakter; tidak disimpan untuk asisten |
| `createdAt` | Firestore Timestamp | Ditulis menggunakan `serverTimestamp()` |

Password dan email dikelola Firebase Auth. Password tidak disimpan di Firestore.
Email tersedia melalui `user.email`. Untuk field pemilik data Sprint 2
(`assistantId`, `studentId`), gunakan **UID**, bukan NIM atau ID mock Sprint 1.
Keanggotaan kelas disimpan pada `classes.studentIds`, bukan pada profil akun.
Array tersebut berisi UID praktikan, bukan NIM. Lihat `docs/schedule.md`.

Jika penyimpanan profil gagal setelah akun dibuat, register mencoba menghapus
akun baru agar email bisa digunakan untuk mencoba lagi. Jika penghapusan juga
gagal, pengguna mendapat pesan untuk menghubungi pengelola dan bisa keluar dari
akun yang profilnya belum lengkap. Retry pembacaan profil tersedia tanpa membuat akun baru.

## Firebase Console

Email/Password Authentication harus aktif. Rules awal `allow read, write: if false`
tidak mengizinkan register menyimpan profil. Untuk tahap akun ini:

1. Buka Firestore Database → Rules pada proyek tim yang benar.
2. Tinjau lalu salin isi `firestore.rules` dan Publish.
3. Rules mengizinkan pengguna membaca dan membuat **profilnya sendiri**,
   serta membaca kelas/sesi yang sesuai. List profil, perubahan/penghapusan
   profil, dan operasi tulis koleksi praktikum tetap ditolak.

Pemilihan kedua role saat register mengikuti pembagian sprint. Artinya, pada
tahap demo ini pengguna dapat mendaftar sebagai asisten. Jika tim nantinya
membatasi pendaftaran asisten, alur register dan Rules harus diubah bersama.
Rules CRUD kelas/sesi, presensi, izin, dan ulasan menjadi bagian integrasi pemilik fitur tersebut.

File Rules belum otomatis diterapkan ke proyek cloud. Jika sudah ada Rules
tambahan dari anggota lain, gabungkan aturan `users` tanpa menghapus aturan mereka.
`firebase.json` menghubungkan file lokal `firestore.rules` untuk deployment CLI;
perubahan file lokal saja tidak mengubah aturan yang aktif di Firebase Console.

Jika register menampilkan "Akses profil ditolak" sementara Rules aktif masih
`allow read, write: if false`, terapkan aturan profil di atas terlebih dahulu.
Pastikan proyek Console adalah `ppk-praktikum-2026-b0df4` dan database `(default)`.
Setelah Publish, buka ulang aplikasi dan coba register kembali. Akun baru dari
percobaan yang gagal biasanya sudah dihapus oleh rollback. Jika email masih
terdaftar tetapi profil belum ada, periksa akun tersebut bersama pengelola;
jangan membuka seluruh database untuk mengatasi masalah ini.

## Alur dan pengujian

`/` (login) → `/register` → buat akun/profil → `/jadwal` (tab utama).
Jadwal berada di `src/app/(app)/jadwal.tsx`. `/home` tetap menjadi alias ke
`/jadwal` agar URL dari versi sebelumnya tidak berubah menjadi unmatched route.
Rute `/` selalu tersedia sebagai pintu masuk: menampilkan login ketika belum
masuk, atau mengarahkan ke `/jadwal` ketika akun dan profil sudah siap.
Root layout melindungi register untuk pengguna yang belum masuk dan halaman
privat untuk akun dengan profil valid. Logout kembali ke `/` yang tetap terdaftar,
sehingga URL awal tidak berubah menjadi halaman unmatched route.
Jadwal menampilkan nama/peran dan NIM praktikan dari profil Firebase. Logout
tersedia di header. Tab asisten adalah Jadwal/Daftar Izin; tab praktikan adalah
Jadwal Saya/Riwayat Saya. Rute tujuan fitur anggota lain masih berupa penghubung
sampai implementasi mereka diintegrasikan.

Jalankan `npx expo start --dev-client` menggunakan development APK yang sudah
memuat Firebase App, Auth, dan Firestore. Perubahan ini tidak menambah paket native.

Uji di HP setelah Rules diterapkan:

1. Register praktikan; cek dokumen `users/{uid}` dan NIM di jadwal.
2. Logout, login kembali, lalu tutup/buka aplikasi; identitas tetap sesuai akun.
3. Register asisten; profil tidak memiliki field NIM dan tab sesuai peran asisten.
4. Coba field kosong, email tidak valid, password pendek, konfirmasi berbeda,
   email terdaftar, serta kredensial salah; pesan harus jelas dan tombol bisa dipakai lagi.
5. Putuskan internet saat login atau tolak Rules profil; aplikasi menampilkan
   kegagalan dan tidak memberi akses ke beranda tanpa profil yang valid.
6. Coba baca profil UID lain dan ubah role melalui client; Rules harus menolak.

Unit test lokal: `node --test tests/*.test.cjs`. Test auth memakai SDK palsu untuk
validasi, kontrak profil, kegagalan layanan, rollback akun, dan lifecycle listener;
bukan bukti
koneksi cloud atau keberhasilan Rules di Firebase Console.
Test navigasi memakai pencocokan rute dan stack router Expo yang terpasang untuk
memeriksa URL login/beranda, guard, dan perpindahan login/logout yang berhenti pada rute yang benar.
