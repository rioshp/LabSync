# Administrasi LabSync

Aplikasi memakai Firebase Authentication dan Firestore paket Spark. Model sentimen di `ai/` dijalankan di perangkat.

## Menyiapkan akun asisten

Buat identitas di Firebase Authentication dan pastikan alamat email sudah terverifikasi. Dari sesi CLI dengan Application Default Credentials dan izin Firebase yang sesuai, jalankan perintah berikut:

```sh
cd functions
npm ci
GOOGLE_CLOUD_PROJECT=ppk-praktikum-2026-b0df4 node scripts/profile.cjs provisionAssistant FIREBASE_AUTH_UID "Nama Asisten"
```

Skrip memeriksa identitas dan menjaga akun praktikan yang sudah memiliki data akademik. Gunakan identitas terpisah jika akun praktikan sudah punya keanggotaan, presensi, izin, atau ulasan. Untuk menonaktifkan atau mengaktifkan profil, ganti argumen menjadi `setAccountStatus FIREBASE_AUTH_UID disabled` atau `setAccountStatus FIREBASE_AUTH_UID active`.

`npm test` menjalankan tes model sentimen. Tes integrasi untuk jalur aplikasi saat ini ada di direktori `tests/` pada root aplikasi.
