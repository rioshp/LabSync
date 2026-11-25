# LabSync

Aplikasi React Native untuk praktikum: jadwal kelas, sesi, presensi realtime, izin, dan ulasan. Sprint 2 menggunakan Firebase Authentication dan Firestore pada paket Spark. Spesifikasi sprint ada di `Project.md` pada folder induk workspace.

- `src/app` berisi rute Expo Router. Tampilan utama mengikuti tema LabSync di `src/constants/theme.ts`.
- `src/features` memisahkan alur akademik dan partisipasi.
- `src/lib` dan `src/hooks` menghubungkan aplikasi ke Auth, listener, dan fungsi mutasi.
- `functions/ai` berisi model sentimen yang dipakai aplikasi. `functions/scripts` berisi [skrip administratif](functions/README.md).
- `firestore.rules` dan `firestore.indexes.json` mengikuti skema Sprint 2. Aplikasi membaca melalui Firestore dan menulis lewat transaksi Firestore yang diperiksa Security Rules.

## Membaca kode

- Mulai dari `src/app/_layout.tsx` untuk akses dan layar detail. Tab utama ada di `src/app/(tabs)`. Layar akademik dan file `.styles.ts` ada di `src/features/academic`.
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

## Sprint 3 — lokasi laboratorium dan presensi

Bagian Nandra menambahkan master laboratorium, pemilih wilayah pada peta, aktivitas lab realtime, dan halaman khusus presensi. Modul notifikasi/Profil milik Nuha tetap dipertahankan.

### Peta OpenFreeMap

Peta memakai `@maplibre/maplibre-react-native` dan gaya **Positron** dari OpenFreeMap. Tidak memerlukan API key Google Maps, akun Google Cloud Billing, atau kartu pembayaran. Style/tiles dimuat melalui internet dari `https://tiles.openfreemap.org/styles/positron`; atribusi OpenMapTiles/OpenStreetMap tetap ditampilkan oleh kontrol peta.

Dependensi dan plugin sudah dikonfigurasi. Karena Google Maps diganti dengan modul native MapLibre, pasang development build baru yang kamu buat sendiri, lalu gunakan `npx expo start --dev-client`. Expo Go atau development build lama belum memuat modul tersebut. Tidak perlu mengisi `GOOGLE_MAPS_ANDROID_API_KEY`; variabel lama jika masih ada di `.env` tidak dibaca lagi. Firebase Auth/Firestore dan konfigurasi login Google tetap digunakan seperti sebelumnya.

Jika peta gagal dimuat, gunakan **Muat ulang peta**. Daftar lab dan input koordinat manual tetap tersedia. Peta web tetap memakai fallback daftar; provider baru diterapkan pada aplikasi native.

Referensi: [OpenFreeMap](https://openfreemap.org/quick_start/) dan [setup MapLibre untuk Expo](https://maplibre.org/maplibre-react-native/docs/setup/expo/).

### Alur penggunaan

- Asisten: **Praktikum → Kelola laboratorium → Tambah laboratorium → Pilih lokasi di peta**. Saat membuat lab, izinkan GPS agar peta otomatis menuju posisi sekarang dengan zoom gedung. Geser peta di bawah pin tengah atau ketuk gedung tujuan, atur radius 10–100 meter, lalu konfirmasi dan simpan. Zoom awal menampilkan area sekitar titik; mengubah radius tidak mengubah zoom sehingga lingkaran mengecil/membesar sesuai field. Radius 10 m berarti diameter 20 m. Nilai tidak valid menyembunyikan lingkaran, tanpa pengganti 50 m; lingkaran dan pin tetap di tengah saat peta digeser, dan scroll panel dikunci selama menyentuh peta. Tombol **Kembali ke posisi saya** memusatkan ulang; koordinat manual tersedia sebagai opsi. Lokasi lab lama dipertahankan saat mengedit. Pemilik lab dapat mengubah atau mengarsipkan lab; asisten lain tetap dapat memilih lab aktif tersebut untuk sesi miliknya.
- Form sesi hanya memilih lab aktif. Radius selalu dibaca dari laboratorium, tanpa pengaturan radius per sesi. Ruang tetap disimpan sebagai label historis. Setiap pembuatan, edit jadwal/lab, pembukaan, penutupan, dan pembatalan sesi memperbarui `labSchedules/{sessionId}` dalam transaksi yang sama. Perubahan penghitung izin tidak memerlukan perubahan proyeksi.
- Kedua peran: **Peta Lab** menampilkan lab aktif dan aktivitas sesi yang dibuka serta jadwal berikutnya. Izin lokasi yang ditolak tidak menghalangi pembacaan lab/jadwal. Posisi pengguna hanya disimpan di memori perangkat selama fitur dibuka.
- Praktikan: **Detail sesi → Presensi sekarang → Konfirmasi presensi**. Halaman khusus membaca sesi, lab, presensi, dan izin realtime. Presensi mengambil sampel lokasi baru dan menghitung ulang jarak di transaksi; Security Rules memeriksa jarak lagi dari koordinat, bukan memercayai angka jarak klien.

Sampel harus berumur maksimal 15 detik pada aplikasi, akurasi positif maksimal 30 meter, dan tidak dilaporkan sebagai lokasi simulasi. Rules membatasi waktu sampel terhadap waktu server. Waktu sampel tetap berasal dari perangkat; rancangan ini tidak menjamin perangkat bebas pemalsuan GPS.

Perubahan koordinat/radius lab langsung berlaku pada pemeriksaan lokasi dan transaksi presensi berikutnya, termasuk untuk sesi yang sudah dibuat. Catatan hadir menyimpan radius saat presensi sebagai bukti historis. Jangan memindahkan atau mengarsipkan lab saat presensi berjalan. Lab arsip menolak presensi baru dan pembukaan sesi; sesi yang sudah ada tetap dapat ditutup/dibatalkan agar riwayat tidak hilang. Tidak ada hard delete lab dari aplikasi.

### Kompatibilitas dan penerapan

Sesi lama tanpa `labId` tetap terbaca. Field `radiusMeters` pada sesi lama diabaikan; tidak diperlukan migrasi untuk memakainya dengan radius lab. Sesi terjadwal harus diedit untuk memilih lab sebelum dibuka. Sesi terbuka lama dapat ditutup; buat sesi berlokasi baru untuk presensi Sprint 3. Presensi lama tidak diberi koordinat buatan.

Indeks baru: `labs(status,name)` dan `labSchedules(labId,status,startsAt)`. Setelah menguji pada proyek demo, terapkan rules dan indexes ke proyek yang disepakati dan tunggu indeks siap. Klien lama yang belum mengirim bukti lokasi/proyeksi tidak kompatibel untuk mutasi setelah rules Sprint 3 diterapkan; distribusikan build baru bersama cutover rules. Kode ini tidak memigrasikan atau men-deploy data aktif secara otomatis.

### Verifikasi penerimaan Sprint 3

Jalankan `npm run typecheck`, `npm run lint`, `npm test`, dan `npm run test:emulators`. Emulator memakai proyek `demo-labsync` dan membutuhkan Firebase CLI serta Java 21+. Tes lokasi dan lab ada di `tests/location.test.cjs` dan `tests/labs.test.cjs`; uji rules/transaksi berada di `tests/firebase.integration.cjs`.

Demo dua perangkat yang wajib dilakukan setelah development build MapLibre siap:

1. Asisten membuat lab dan sesi, menambahkan peserta, lalu membuka sesi. Praktikan di luar radius ditolak; di dalam radius berhasil sekali; rekap asisten berubah tanpa restart. Tutup sesi dan buktikan tidak ada presensi baru.
2. Buka Peta Lab pada kedua akun. Pilih marker, ubah jadwal/status sesi dari perangkat asisten, dan periksa aktivitas mengikuti perubahan. Periksa posisi diri saat bergerak serta kembalinya layar dari background.
3. Uji izin ditolak/diblokir, GPS mati, lokasi tidak akurat/kedaluwarsa, offline, lab tanpa jadwal, pembesaran teks, dan batal memilih lokasi tanpa mengubah draft.
4. Uji notifikasi bersama Nuha melalui alur dan konfigurasi modul notifikasi yang sudah tersedia. Keberhasilan bundle atau tes emulator belum membuktikan GPS/peta/push pada perangkat nyata.
