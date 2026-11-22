# Panduan agen LabSync

LabSync adalah MVP mobile untuk kelas praktikum, jadwal sesi, presensi, izin, dan ulasan. Repo aplikasi ada di `LabSync/` bila workspace dibuka dari folder induk. Jalankan perintah dari root repo ini. Aplikasi memakai Expo Router, React Native + TypeScript, Firebase Auth, dan Firestore paket Spark. Layar membaca data melalui listener dan menulis langsung ke Firestore melalui transaksi. Analisis sentimen berjalan di perangkat.

[README.md](README.md) memuat setup, konfigurasi Google, dan langkah demo. Spesifikasi awal ada di `../Project.md` bila tersedia di workspace. Untuk perilaku yang sudah berjalan, rujuk layar, transaksi, rules, dan tes di repo ini. Kelas baru dibuat langsung sebagai **Kelas Praktikum**, dan satu kelas memiliki banyak sesi.

## Peta struktur

| Area | Mulai dari |
| --- | --- |
| Login, registrasi, verifikasi, dan lengkapi profil | `src/app/index.tsx`, `src/app/register.tsx`, `src/hooks/useAuth.ts`, `src/components/account-setup.tsx` |
| Sesi akun dan akses rute | `src/app/_layout.tsx` mengatur akses masuk dan rute detail. `src/app/(tabs)/_layout.tsx` mengatur tab per peran |
| Profil dan metode masuk | `src/app/(tabs)/profil.tsx`, `src/lib/auth.ts`, `src/lib/profile.ts` |
| Jadwal, kelas, peserta, dan detail sesi asisten | `src/features/academic/` berisi `schedule.tsx`, `assistant-practicum.tsx`, dan `assistant-session.tsx`. Hook dan listener ada di `useAcademic.ts` dan `listeners.ts` dalam folder akademik |
| Detail dan riwayat praktikan, formulir izin dan ulasan, serta daftar izin asisten | `src/features/participation/student.tsx`, `assistant-permits.tsx`, dan `data.ts` dalam folder partisipasi |
| Mutasi dan validasi | `src/lib/mutations.ts` menghubungkan UI ke `classes.ts`, `sessions.ts`, `roster.ts`, `participation.ts`, dan `reviews.ts`. Gunakan validator bersama di `firestore-input.ts` |
| Firebase dan native config | `src/lib/firebase.ts`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `app.json`, `plugins/`, dan `eas.json` |
| Model sentimen dan administrasi akun | `functions/ai/` dipakai oleh aplikasi. `functions/scripts/profile.cjs` adalah CLI operator. Cara menyiapkan akun asisten ada di [functions/README.md](functions/README.md) |

Komponen umum ada di `src/components/`, tema di `src/constants/theme.ts`, dan gaya layar akademik di file `.styles.ts` di samping komponennya. Pakai komponen dan pola yang sudah ada. Simpan validasi penulisan di modul mutasi, dan beri komentar singkat untuk alasan yang sulit ditebak, misalnya kenapa dua dokumen harus ditulis dalam satu transaksi.

## Alur pengguna

- **Masuk dan profil.** Email/password melalui verifikasi email. Login Google membuat identitas Auth pada login pertama. Akun terverifikasi tanpa `users/{uid}` masuk ke **Lengkapi profil**. Profil Firestore aktif yang dikonfirmasi server membuka aplikasi. Linking Google dan password mempertahankan UID, termasuk saat pengguna perlu membuktikan kepemilikan akun dengan password lama. Praktikan melengkapi profil sendiri dan operator menyiapkan peran asisten.
- **Asisten.** Tab **Praktikum** membuka daftar kelas. Detail kelas punya tab **Peserta** untuk pencarian NIM atau nama lengkap dan **Sesi** untuk jadwal. **Jadwal** dan **Rekap & detail** membuka detail sesi yang sama. Di sana asisten membuka atau menutup sesi dan melihat rekap presensi. **Daftar Izin** diputuskan oleh asisten. **Ulasan & AI** pada sesi selesai menampilkan ringkasan sentimen.
- **Praktikan.** **Jadwal Saya** bersumber dari keanggotaan aktif. Detail sesi menawarkan presensi saat sesi dibuka atau izin saat terjadwal atau dibuka, sesuai status catatan. Izin menunggu atau disetujui menghalangi presensi. **Riwayat Saya** memakai snapshot yang disimpan pada catatan. Praktikan yang hadir dapat mengirim satu ulasan setelah sesi ditutup dan membaca teks ulasan miliknya. Asisten melihat jumlah per label untuk sesi miliknya.

## Kontrak yang perlu dijaga

- `users/{uid}` menentukan peran dan status akun. `studentKeys/{nim}` menjaga NIM unik lewat transaksi profil. Pembatasan rute membantu navigasi, dan Security Rules menentukan akses data.
- `classes/{classId}` menyimpan kelas. Kelas baru memakai `practicumId: null` dan `practicumName` mengikuti nama kelas. Kelas lama yang masih terhubung ke `practicums/{practicumId}` memakai transaksi yang juga menjaga penghitung induknya.
- Sesi disimpan di `classes/{classId}/sessions/{sessionId}`. Sesi terjadwal bisa diedit, dibuka, atau dibatalkan. Sesi terbuka bisa ditutup. Perubahan status yang memengaruhi penghitung kelas dan keputusan yang memengaruhi penghitung izin diperbarui bersama dalam transaksi yang sama. Simpan waktu sebagai `Timestamp` dan pakai zona IANA kelas melalui `src/features/academic/time.ts`.
- Keanggotaan memakai ID `{classId}~{uid}`. Presensi, izin, dan ulasan memakai `{sessionId}~{uid}`. Untuk catatan pribadi dalam detail sesi, gunakan pembacaan dokumen langsung agar rules `get` bisa mengizinkan pemeriksaan catatan milik sendiri yang belum dibuat. Untuk daftar riwayat, pertahankan filter kepemilikan.
- Ulasan dan `reviewSummaries/{sessionId}` ditulis dalam satu transaksi. Aplikasi mengirim label model beserta statusnya. Rules menjaga identitas, nilai label, dan penghitung. Teks tetap tersimpan bila model gagal. Izin diputuskan secara manual.

## Cara menambah atau mengubah fitur

| Perubahan | Jalur kerja |
| --- | --- |
| Tambah layar atau tab | Buat rute tipis di `src/app/` dan simpan implementasi di area fitur yang sesuai. Tambahkan tab di layout `(tabs)`, atau detail di stack `src/app/_layout.tsx` dengan guard peran. Gunakan `router.push` dengan `classId` dan `sessionId` bila relevan. Cek tujuan rute dan layar yang muncul saat kembali lewat `tests/navigation.test.cjs` |
| Ubah formulir kelas atau sesi | Mulai dari `assistant-practicum.tsx`, lalu ikuti aksi di `mutations.ts` ke `classes.ts` atau `sessions.ts`. Bila field sesi berubah, cek parser `listeners.ts`, rules, dan pembaca lain seperti riwayat yang memakai snapshot. Gunakan request ID yang sama ketika mencoba ulang pembuatan dari form yang sama |
| Ubah peserta atau akses jadwal | Ikuti `roster.ts` → `enrollments` → `subscribeSchedule` di `listeners.ts`. Cek bahwa penambahan dan penghapusan peserta memperbarui jadwal dan akses sesi. Pakai `tests/schedule.test.cjs` untuk perilaku listener dan tes integrasi untuk aturan akses |
| Ubah presensi, izin, atau ulasan | Mulai dari layar partisipasi, lalu buka transaksi di `participation.ts` atau `reviews.ts`. Cocokkan ID, status sesi, write terkait, dan izin baca dengan rules. Uji alur sebelum catatan ada, setelah dikirim, dan dari akun yang berbeda |
| Ubah login atau profil | Ikuti `useAuth.ts` dari identitas Auth ke dokumen profil dan guard root. Cek alur akun baru, akun lama, dan UID saat linking. Gunakan `tests/auth.test.cjs` dan `tests/navigation.test.cjs` |

Saat mengubah query, cek filter kepemilikan di `firestore.rules` dan kebutuhan indeks di `firestore.indexes.json`. Saat menyelidiki pesan akses ditolak, identifikasi pembacaan yang gagal lebih dulu. Detail praktikan membaca kelas, sesi, presensi, dan izin secara terpisah. Perbarui panduan ini bila struktur atau alur utama berubah.

## Verifikasi dan operasi

Untuk perubahan lokal, jalankan `npm run typecheck`, `npm run lint`, dan `npm test`. Untuk model atau CLI operator gunakan `npm test --prefix functions` dan `npm run check --prefix functions`. Tes integrasi `npm run test:emulators` memakai proyek `demo-labsync` dan Java 21+. Jalankan emulator bila pengujian rules memang dibutuhkan dan sesuai instruksi pengguna. Langkah uji perangkat ada di bagian **Demo penerimaan** pada README.

Untuk kode JS/TS pada development build yang kompatibel, gunakan `npx expo start --dev-client` dan reload dari Metro. Build native baru diperlukan bila dependensi atau konfigurasi yang masuk ke aplikasi native berubah. Pakai EAS jika build diminta. Untuk deploy Firebase dan operasi akun atau data aktif, gunakan proyek tujuan yang diotorisasi pengguna.

## Expo dan dependensi

Sebelum mengubah kode yang memakai API Expo, EAS, atau React Native, cek versi mayor Expo di `package.json`. Baca dokumentasi SDK yang sesuai di `https://docs.expo.dev/versions/v<major>.0.0/` dan gunakan [indeks dokumentasi Expo](https://docs.expo.dev/llms.txt) untuk menemukan halaman API yang dibutuhkan. Gunakan [Expo Router](https://docs.expo.dev/router/introduction.md) untuk navigasi.

Saat perlu menambah paket native, gunakan `npx expo install <paket>` dengan pengelola paket repo. Kelola konfigurasi native dari `app.json` dan config plugin melalui Continuous Native Generation. Direktori `android/` dan `ios/` yang dihasilkan mengikuti konfigurasi tersebut. Aplikasi memakai development build karena Firebase dan Google Sign-In memerlukan modul native. Profil EAS ada di `eas.json` dan prosedur Android ada di README.
