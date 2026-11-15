# Referensi tampilan Sprint 1

Salinan asli sebelum layar Nandra beralih ke Firebase. File `.tsx.txt` adalah
arsip untuk dibaca/disalin seperlunya, tidak didaftarkan sebagai rute, tidak
diimpor aplikasi, dan tidak ikut pemeriksaan TypeScript.

| Arsip | Sumber Git | Isi |
| --- | --- | --- |
| [index.tsx.txt](index.tsx.txt) | `de20ec2:src/app/index.tsx` | Pilihan peran/pengguna mock, background, dan animasi intro |
| [jadwal.tsx.txt](jadwal.tsx.txt) | `462619c:src/app/jadwal.tsx` | Jadwal mock, kartu sesi, badge, dan navigasi Sprint 1 |

Layar Firebase aktif ada di `src/app/index.tsx` dan
`src/app/(app)/jadwal.tsx`. Jangan menyalin pemilihan identitas mock ke alur
Firebase; gunakan `useAuth()` dan ID dokumen Firestore.

Template anggota lain tetap di lokasi semula tanpa perubahan isi:

- `src/app/asisten-sesi.tsx` dan `src/app/rekap-asisten.tsx` (Baihaqi).
- `src/app/praktikan-presensi.tsx` (Danendra).
- `src/app/riwayat-praktikan.tsx` (Rio).
- `src/constants/mockData.ts` sebagai data pendukung Sprint 1.

Rute Sprint 2 di `(app)/asisten/` dan `(app)/praktikan/` masih penghubung
sederhana, bukan pengganti implementasi template lama.

Komponen Expo starter (`app-tabs*`, `animated-icon*`, `themed-*`, `hint-row`,
`web-badge`, dan `ui/collapsible`) juga dipertahankan untuk referensi. Sebagian
belum digunakan alur LabSync aktif. `app-tabs.web.tsx` masih memiliki dua error
TypeScript bawaan checkout ini: tautan `/explore` yang belum ada dan tipe ref
`TabButton`. File itu tidak diimpor navigator LabSync; audit Nandra tidak
mengubah atau menghapusnya.
