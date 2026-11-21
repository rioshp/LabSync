# LabSync

Aplikasi React Native untuk praktikum: jadwal kelas, sesi, presensi realtime, izin, dan ulasan. Sprint 2 menggunakan Firebase Authentication dan Firestore pada paket Spark. Spesifikasi sprint ada di `Project.md` pada folder induk workspace.

- `src/app` berisi rute Expo Router. Tampilan utama mengikuti tema LabSync di `src/constants/theme.ts`.
- `src/features` memisahkan alur akademik dan partisipasi.
- `src/lib` dan `src/hooks` menghubungkan aplikasi ke Auth, listener, dan fungsi mutasi.
- `functions/ai` berisi model sentimen yang dipakai aplikasi. `functions/scripts` berisi [skrip administratif](functions/README.md).
- `firestore.rules` dan `firestore.indexes.json` mengikuti skema Sprint 2. Aplikasi membaca melalui Firestore dan menulis lewat transaksi Firestore yang diperiksa Security Rules.

## Membaca kode

- Mulai dari URL atau tab di `src/app`. File rute menunjuk ke layar di `src/features`; gaya layar akademik berada di file `.styles.ts` di sebelahnya.
- Hook jadwal, kelas, dan sesi ada di `src/features/academic/useAcademic.ts`. Listener Firestore ada di `src/features/academic/listeners.ts`. Detail sesi memakai data kelas yang sudah dimuat dan mendengarkan satu sesi.
- Alur baca dan tulis terpisah. Layar mendengarkan Firestore melalui hook dan mengirim perubahan melalui `src/lib/mutations.ts`. Firestore Security Rules memeriksa peran dan kepemilikan sebelum commit.
- Fungsi di `src/lib` menangani profil, kelas praktikum, sesi, peserta, presensi, izin, dan ulasan. Sentimen dihitung di perangkat saat ulasan dikirim.

Konfigurasi format ada di `.prettierrc.json`. Untuk menerapkannya ke sumber, tes, dan konfigurasi JavaScript tanpa menjalankan build:

```sh
npx --yes prettier@3.6.2 --write 'src/**/*.{ts,tsx}' 'functions/**/*.{cjs,js}' 'tests/**/*.cjs' 'plugins/*.js' eslint.config.js
```

## Jalankan dan verifikasi

Gunakan versi Node yang didukung Expo. Untuk Emulator Suite, siapkan Firebase CLI dan Java 21 atau lebih baru.

```sh
npm ci
npm ci --prefix functions
npm run typecheck
npm run lint
npm test
npm test --prefix functions
npm run test:emulators
```

Tes integrasi hanya menerima project ID dengan awalan `demo-`. Ia membuat dua asisten dan dua praktikan pada Auth emulator, menjalankan modul transaksi yang dipakai aplikasi, dan memeriksa aturan Firestore serta listener dari klien berbeda.

Untuk menjalankan aplikasi, gunakan development build Android, lalu `npx expo start --dev-client`. Aplikasi menggunakan modul native Firebase dan Google sehingga perlu build ulang setelah dependensi native berubah. Untuk menghubungkan build pengembangan ke emulator, salin `.env.example` ke `.env.local`, isi `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`, dan jalankan Auth dan Firestore emulator dengan project ID yang cocok dengan konfigurasi Firebase pada build Android. Android emulator memakai `10.0.2.2`; perangkat fisik memakai IP LAN komputer. Pastikan alamat yang didengar emulator bisa dijangkau perangkat pada jaringan pengujian.

## Akun demo untuk pengujian

Masukkan email dan password akun demo langsung di layar masuk. Kosongkan `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` untuk memakai Firebase aktif. Peran praktikan dan asisten mengikuti profil Firestore.

## Login dengan Google pada Android

1. Aktifkan provider Email/Password dan Google di Firebase Authentication untuk proyek pengujian.
2. Daftarkan SHA-1 build Android pada aplikasi Firebase yang cocok dengan package. Sertifikat development, APK yang didistribusikan, dan Play App Signing dapat berbeda.
3. Ambil ulang `google-services.json` dari proyek yang sama; aplikasi menggunakan OAuth **Web client ID** dari konfigurasi tersebut. Gunakan `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` hanya bila integrasi build memerlukan override. Nilai ini adalah ID, bukan client secret.
4. Uji akun Google baru, masuk ulang dengan akun yang sama, pembatalan, dan linking setelah konflik penyedia. Development build yang sudah memuat modul native Firebase dan Google bisa menjalankan JavaScript terbaru dari Metro.
5. Jika menargetkan iOS, daftarkan aplikasi iOS di Firebase dan siapkan bundle ID, `GoogleService-Info.plist`, dan URL scheme OAuth iOS sebelum membuat build iOS.

## Profil akun

Tab **Profil** menampilkan email serta metode masuk yang terhubung. Semua pengguna dapat mengedit nama. Praktikan juga dapat mengubah NIM. Firestore memindahkan klaim NIM dalam satu transaksi sehingga satu NIM hanya dimiliki satu akun.

Akun Google yang belum memiliki password dapat memilih **Tambahkan password**. Firebase menautkannya ke email dan UID yang sama. Setelah itu, pengguna bisa masuk dengan Google atau email dan password.

## Terapkan ke Firebase

Jalankan dari direktori aplikasi dengan Firebase CLI yang sudah login:

```sh
firebase deploy --only firestore:rules,firestore:indexes --project ppk-praktikum-2026-b0df4
```

Aturan ini memakai skema Sprint 2. Data lama yang memakai nama field atau path sesi berbeda perlu migrasi sebelum dipakai di aplikasi. Tunggu indeks siap sebelum menguji jadwal, rekap, dan riwayat. Untuk development build yang kompatibel, jalankan `npx expo start --dev-client` dengan `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` kosong agar perangkat memakai Firebase aktif.

## Demo penerimaan

1. Dengan build Android, buat pengguna praktikan melalui registrasi email, verifikasi email dan lengkapi profil; ulangi dengan Google. Uji logout, reset, loading, pembatalan, dan masuk ulang.
2. Dengan akun asisten yang diprovisikan operator, buat kelas dari **Kelas Praktikum**. Buka kelas dan pilih tab **Peserta**, cari dengan NIM atau nama lengkap sesuai profil, lalu konfirmasi peserta yang akan ditambahkan. Buat dua atau lebih sesi dari tab **Sesi**. Gunakan dua perangkat untuk menguji jadwal sesuai kelas, buka sesi, presensi tunggal, rekap realtime, dan penutupan.
3. Pada sesi lain ajukan izin, ambil keputusan sebagai asisten, dan lihat status pada perangkat praktikan. Uji persetujuan dan penolakan. Setelah sesi pertama selesai, kirim ulasan. Sebagai asisten, buka **Praktikum → pilih kelas → Sesi → Ulasan & AI** pada sesi tersebut untuk melihat ringkasan sentimen. Teks ulasan tersedia untuk praktikan penulis.
4. Ulangi agar minimal lima perubahan untuk setiap jenis realtime tercatat. Ukur waktu dari keberhasilan aksi sampai status di perangkat kedua; target demo adalah paling lama 3 detik pada koneksi stabil. Uji jaringan putus, restart, pembesaran teks, dan pembaca layar.
