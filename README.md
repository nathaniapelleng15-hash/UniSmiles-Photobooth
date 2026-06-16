# UniSmile — Smart Interactive Photobooth

Sistem photobooth pintar dan interaktif berbasis web yang memadukan antarmuka modern dengan teknologi deteksi gesture tangan (Air Gesture), kustomisasi frame & filter foto, sistem pembayaran QRIS, serta pengiriman foto otomatis ke email pengguna.

## Ringkasan Cepat

*   **Backend**: Node.js + Express (port default: `3001`)
*   **Frontend**: React + TypeScript + Vite (dev port: `5173`)
*   **Database**: MySQL (`unismile_db`)
*   **Penyimpanan**: Lokal disk (folder `server/uploads/`) dan pengiriman via Gmail SMTP

---

## Fitur Utama

1.  **Air Gesture Detection**: Mengontrol kamera dan pilihan filter menggunakan gestur tangan tanpa menyentuh layar secara fisik.
2.  **Custom Layout & Frame Editor**: Pilihan berbagai layout foto (1x1, 2x1, 3x1, 4x1, 2x2, dll.) serta kustomisasi template frame yang dinamis.
3.  **Real-time Photo Filters**: Penerapan filter warna dan efek secara langsung pada foto hasil tangkapan.
4.  **Simulasi Pembayaran QRIS**: Integrasi pencatatan transaksi untuk setiap cetak/sesi foto menggunakan QRIS.
5.  **Kirim Foto ke Email**: Pengiriman file foto hasil akhir langsung ke email pengguna secara otomatis memanfaatkan protokol SMTP Gmail.
6.  **Admin Panel Terintegrasi**: Kelola daftar transaksi, data frame template, dan monitoring filter aktif.

---

## Spesifikasi Teknologi

*   **Frontend**: React (v19), TypeScript, Lucide React (Icons), Vite (Build Tool).
*   **Backend**: Node.js, Express, Multer (File Upload), Nodemailer (Email Delivery).
*   **Database**: MySQL dengan driver `mysql2/promise` (Connection Pooling).

---

## Panduan Instalasi Cepat

Untuk panduan deployment lengkap dan terperinci, silakan merujuk ke dokumen [System Deployment Guide](.gemini/antigravity-ide/brain/3ad891c9-ecc1-4f8e-bfef-cd810f9b9da5/system_deployment_unismile.md).

### 1. Persiapan Database
1. Buat database baru bernama `unismile_db` di server MySQL Anda.
2. Impor file skema database dari `server/schema.sql`.

### 2. Setup Backend Server
```bash
cd server
npm install
cp .env.example .env   # Konfigurasikan kredensial DB dan Gmail di file .env
npm start
```

### 3. Setup Frontend App
Buka terminal baru di root folder:
```bash
npm install
npm run dev
```
Aplikasi dapat diakses di browser melalui alamat **`http://localhost:5173`**.
