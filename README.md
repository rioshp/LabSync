# Panduan Onboarding & Pengembangan Tim - Mobile App PPK

Dokumentasi ini dibagi menjadi **3 bagian utama**: Prerequisite, Install Aplikasi di Web Expo (Khusus Tim), dan Menjalankan Repo di Komputer Lokal.

---

## 📌 Bagian 1: Prerequisite (Prasyarat)

Sebelum memulai, pastikan Anda telah menyiapkan hal-hal berikut:

1. **Akun Expo:**
   - Daftarkan akun di [expo.dev/signup](https://expo.dev/signup).
   - Pastikan Anda sudah **diundang oleh Owner** ke organisasi **`rio2233s-team`** (cek email undangan atau notifikasi di dashboard Expo Anda).
2. **Lingkungan Komputer:**
   - **Node.js** (Versi LTS: v20 atau v22+)
   - **Git**
   - **npm** (Bawaan Node.js)
   - **EAS CLI** (Opsional/Direkomendasikan):
     ```bash
     npm install -g eas-cli
     ```
3. **Perangkat Uji:**
   - HP Android fisik (disarankan) atau Android Emulator di laptop.

---

## 📲 Bagian 2: Install Aplikasi di Web Expo (Khusus Tim)

> *Hanya akun yang telah diundang sebagai anggota organisasi `rio2233s-team` yang memiliki izin untuk melihat dan mengunduh build ini.*

1. **Buka Web Expo & Login:**  
   Buka browser di HP Android Anda (atau di laptop) dan login ke [expo.dev/login](https://expo.dev/login) menggunakan akun Expo Anda masing-masing.
2. **Buka Proyek Tim:**  
   - Di pojok kiri atas dashboard Expo, pilih organisasi **`rio2233s-team`**.
   - Klik proyek **`mobile-app-ppk`**.
3. **Masuk ke Menu Builds & Unduh APK:**  
   - Di menu sebelah kiri, klik menu **Builds**.
   - Pilih build Android terbaru dengan status **Development Client** yang bertanda centang hijau (✔ Selesai).
   - Klik tombol **Download** atau scan QR code dari HP Android Anda untuk memasang (install) file APK di HP.

---

## 💻 Bagian 3: Jalankan Repo

Setelah aplikasi terpasang di HP Anda, ikuti langkah berikut untuk mulai menjalankan project di komputer lokal:

### 1. Clone Repo
```bash
git clone <URL_REPOSITORY_GIT>
cd mobile-app-ppk
```

### 2. Install Dependensi
```bash
npm install
```

### 3. Jalankan Aplikasi
Jalankan development server Expo:
```bash
npx expo start
```

### 4. Hubungkan Aplikasi di HP (Scan QR)
1. Pastikan **laptop dan HP Android Anda terhubung ke jaringan Wi-Fi yang sama**.
2. Buka aplikasi **mobile-app-ppk** yang sudah Anda install pada **Bagian 2**.
3. Gunakan fitur pemindai di dalam aplikasi untuk **scan QR code** yang muncul di terminal laptop.
4. Project akan terhubung dan siap untuk dikembangkan!

---

## ☁️ Catatan Tambahan: Menjalankan EAS Build Mandiri (Untuk Tim)

Jika tim Anda menambahkan *native library* baru atau ingin membuat build mandiri, anggota tim dapat menjalankan build sendiri melalui terminal:

1. **Login EAS di terminal laptop:**
   ```bash
   eas login
   ```
2. **Jalankan Build:**
   * **Development Client baru:**  
     `eas build --platform android --profile development`
   * **APK Preview Standalone (bisa jalan tanpa server laptop):**  
     `eas build --platform android --profile preview`

---

## 🛠️ Aturan Pengembangan Tim
- **Tambah library:** Wajib gunakan `npx expo install <nama-paket>` (agar versinya kompatibel dengan Expo SDK 58).
- **Sebelum Pull Request:** Selalu jalankan `npm run lint` dan `npx tsc --noEmit`.
