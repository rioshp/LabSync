# LabSync

Aplikasi React Native untuk praktikum: jadwal kelas, sesi, presensi realtime, izin, dan ulasan. Aplikasi menyediakan **Coba demo lokal** pada layar masuk untuk menjalankan alur Sprint 1 dengan data contoh dan state sementara. Sprint 2 menggunakan Firebase Authentication, Firestore, dan Firebase Functions. Spesifikasi sprint ada di `Project.md` pada folder induk workspace.

- `src/app` berisi rute Expo Router. Tampilan utama mengikuti tema LabSync di `src/constants/theme.ts`.
- `src/features` memisahkan alur akademik, partisipasi, dan demo.
- `src/lib` dan `src/hooks` menghubungkan aplikasi ke Auth, listener, dan fungsi mutasi.
- `functions` berisi backend, worker sentimen, skrip operator, dan tes. Lihat [kontrak backend](functions/README.md).
- `firestore.rules` dan `firestore.indexes.json` mengikuti skema Sprint 2. Aplikasi membaca melalui Firestore dan mengubah data melalui fungsi `mutate`.

## Membaca kode

- Mulai dari URL atau tab di `src/app`. File rute menunjuk ke layar di `src/features`; gaya layar akademik berada di file `.styles.ts` di sebelahnya.
- Baca `src/features/academic/listeners.ts` untuk alur jadwal. Daftar kelas menentukan listener sesi yang perlu hidup. Perubahan metadata cache hanya mengubah indikator koneksi. Listener sesi lama tidak boleh mengisi kembali kelas yang sudah diarsipkan atau dilepas.
- Alur baca dan tulis terpisah. Layar mendengarkan Firestore melalui hook dan mengirim perubahan melalui `src/lib/mutations.ts`. Backend memeriksa peran dan kepemilikan sebelum commit.
- Backend masuk lewat `functions/index.cjs`. `validation.cjs` memvalidasi kontrak input, `domain.cjs` menangani otorisasi dan transaksi, dan `review-worker.cjs` memproses sentimen ulasan. Keputusan izin ada di transaksi asisten.

Konfigurasi format ada di `.prettierrc.json`. Untuk menerapkannya ke sumber, tes, dan konfigurasi JavaScript tanpa menjalankan build:

```sh
npx --yes prettier@3.6.2 --write 'src/**/*.{ts,tsx}' 'functions/**/*.{cjs,js}' 'tests/**/*.cjs' 'plugins/*.js' eslint.config.js
```

## Jalankan dan verifikasi

Gunakan versi Node yang didukung Expo dan runtime Functions. Untuk Emulator Suite, siapkan Firebase CLI dan Java 21 atau lebih baru.

```sh
npm ci
npm ci --prefix functions
npm run typecheck
npm run lint
npm test
npm test --prefix functions
npm run test:emulators
```

Tes integrasi hanya menerima project ID dengan awalan `demo-`. Ia membuat dua asisten dan dua praktikan pada Auth emulator, menjalankan mutasi sebagai pengguna sebenarnya, dan memeriksa aturan Firestore serta listener dari klien berbeda.

Untuk menjalankan aplikasi, gunakan development build Android, lalu `npx expo start --dev-client`. Aplikasi menggunakan modul native Firebase dan Google sehingga perlu build ulang setelah dependensi native berubah. Untuk menghubungkan build pengembangan ke emulator, salin `.env.example` ke `.env.local`, isi `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST`, dan jalankan Auth, Firestore, dan Functions emulator dengan project ID yang cocok dengan konfigurasi Firebase pada build Android. Android emulator memakai `10.0.2.2`; perangkat fisik memakai IP LAN komputer. Pastikan alamat yang didengar emulator bisa dijangkau perangkat pada jaringan pengujian.

## Login dengan Google pada Android

1. Aktifkan provider Email/Password dan Google di Firebase Authentication untuk proyek pengujian.
2. Daftarkan SHA-1 build Android pada aplikasi Firebase yang cocok dengan package. Sertifikat development, APK yang didistribusikan, dan Play App Signing dapat berbeda.
3. Ambil ulang `google-services.json` dari proyek yang sama; aplikasi menggunakan OAuth **Web client ID** dari konfigurasi tersebut. Gunakan `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` hanya bila integrasi build memerlukan override. Nilai ini adalah ID, bukan client secret.
4. Buat development atau preview build baru. Pada build itu, uji akun Google baru, masuk ulang dengan akun yang sama, pembatalan, dan linking setelah konflik penyedia.
5. Jika menargetkan iOS, daftarkan aplikasi iOS di Firebase dan siapkan bundle ID, `GoogleService-Info.plist`, dan URL scheme OAuth iOS sebelum membuat build iOS.

APK yang memakai Firebase production baru boleh dipakai setelah backend, aturan dan indeks skema Sprint 2 tersedia pada proyek yang dipakai APK. Deployment Functions generasi kedua memerlukan proyek dengan billing yang mendukung layanan tersebut. Uji deployment dan data pada proyek staging sebelum memilih jadwal perubahan untuk proyek aktif. Rules ini memblokir penulisan langsung dari klien lama dan koleksi sesi baru berada di bawah kelas; data dengan skema lama tidak otomatis dipindahkan. Tentukan migrasi/backup dan verifikasi akun asisten lewat jalur operator sebelum rollout ke proyek yang sudah punya data.

## Demo penerimaan

1. Dengan build Android, buat pengguna praktikan melalui registrasi email, verifikasi email dan lengkapi profil; ulangi dengan Google. Uji logout, reset, loading, pembatalan, dan masuk ulang.
2. Dengan akun asisten yang diprovisikan operator, buat praktikum, kelas, peserta dan dua atau lebih sesi. Gunakan dua perangkat untuk menguji jadwal sesuai kelas, buka sesi, presensi tunggal, rekap realtime, dan penutupan.
3. Pada sesi lain ajukan izin, ambil keputusan sebagai asisten, dan lihat status pada perangkat praktikan. Uji persetujuan dan penolakan. Setelah sesi pertama selesai, kirim ulasan dan periksa hasil/ringkasan sentimen.
4. Ulangi agar minimal lima perubahan untuk setiap jenis realtime tercatat. Ukur waktu dari keberhasilan aksi sampai status di perangkat kedua; target demo adalah paling lama 3 detik pada koneksi stabil. Uji jaringan putus, restart, pembesaran teks, dan pembaca layar.
