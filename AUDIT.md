# Audit Proyek Soalify

## Ruang Lingkup

Audit statis dan verifikasi lokal terhadap frontend React/TypeScript, Supabase Edge Functions, skema database/RLS, dependensi, dokumentasi, Git, dan deployment. Folder `backend/` diperlakukan sebagai implementasi Laravel lama sesuai README utama.

Commit yang diaudit: `e2994e99a49a535a0a690f74056c9f9d25976adf`.

## Ringkasan Proyek

Soalify adalah aplikasi pembuat soal berbasis AI untuk guru Indonesia. Stack aktif:

- React 19, TypeScript, Vite, dan Tailwind CSS.
- Supabase Auth, PostgreSQL/RLS, Storage, dan Edge Functions.
- Gemini untuk akun gratis dan OpenAI untuk akun premium.
- Vercel untuk frontend.

Fitur utama yang sudah tersedia mencakup autentikasi Google, wizard konfigurasi ujian, enam format soal, referensi AI/teks/PDF, routing model AI berdasarkan tier, ilustrasi, kredit, histori, edit, hapus, serta ekspor PDF/DOCX.

## Status Verifikasi

- Production build: **lulus**; 2.403 modul berhasil ditransformasi.
- Bundle utama: **1.011,68 kB** atau **319,26 kB gzip**; melewati peringatan 500 kB.
- Lint: **gagal**, terdapat **10 error dan 2 warning**.
- Automated test aktif: **belum tersedia**.
- `npm audit --omit=dev`: **20 vulnerability** — 11 high, 5 moderate, 4 low.
- `npm ci`: **gagal** karena `package-lock.json` tidak sinkron dengan `package.json`/dependency graph.
- CI GitHub Actions: **belum tersedia**.
- Deployment Vercel commit terakhir: **success**.
- Ukuran codebase: 136 file terukur, sekitar 7.743 baris kode dan 860 baris komentar.

## Temuan Prioritas

### P0 — Kritis

1. **Pengguna dapat menambah kredit dan premium sendiri**  
   Policy UPDATE profil hanya memeriksa kepemilikan baris dan tidak membatasi kolom sensitif. Pengguna terautentikasi dapat mengubah `credits_balance`, `subscription_tier`, dan `subscription_expiry` melalui Supabase Data API.  
   Referensi: `supabase/migrations/20260515000000_initial_buat_soal_schema.sql:146-151`.

2. **Checkout memberikan benefit tanpa pembayaran terverifikasi**  
   `billing-checkout` langsung menambah kredit dan mengaktifkan premium setelah menerima `package_id`; belum ada order pembayaran, webhook bertanda tangan, validasi status paid, maupun idempotensi.  
   Referensi: `supabase/functions/billing-checkout/index.ts:20-75`.

3. **Pengurangan kredit dan penyimpanan ujian tidak atomik**  
   Pengecekan saldo, insert ujian, insert soal, update saldo, dan ledger dilakukan dalam operasi terpisah. Request paralel dapat memakai saldo yang sama; kegagalan di tengah proses dapat meninggalkan data parsial.  
   Referensi: `supabase/functions/exam-generate/index.ts:73-155`.

### P1 — Tinggi

4. **Edit judul soal dapat menghapus konten multiline**  
   Input header hanya menampilkan baris pertama, tetapi perubahan menimpa seluruh `question_content`.  
   Referensi: `src/pages/ReviewExam.tsx:271-275`, `302-308`.

5. **Bulk save edit tidak atomik**  
   Update per soal dijalankan melalui `Promise.all`; sebagian data dapat sudah tersimpan saat satu request gagal.  
   Referensi: `src/pages/ReviewExam.tsx:97-128`, `src/lib/api.ts:376-403`.

6. **Validasi payload dan PDF belum cukup ketat**  
   Belum ada batas request/file, validasi magic bytes PDF, whitelist enum/format, integer aman, rate limit, atau pembatasan panjang teks/array.  
   Referensi: `supabase/functions/exam-generate/index.ts:174-228`, `supabase/functions/_shared/ai.ts:129-184`.

7. **Dependency graph memiliki vulnerability tinggi**  
   Audit menemukan 20 vulnerability. Axios tidak digunakan tetapi menjadi dependency langsung; React Router dan beberapa dependency transitif juga terdampak advisory.

8. **Belum ada idempotensi dan recovery generation**  
   Retry dapat menghasilkan duplikasi, biaya AI berulang, double charge, atau file orphan. Tabel sesi belum memiliki request key dan status lifecycle.

### P2 — Menengah

9. Fase D tidak menyediakan kelas 9 (`src/pages/GenerateExam.tsx:179-186`).
10. UI belum mewajibkan PDF/teks manual dan minimal satu format sebelum submit.
11. Kegagalan hapus tidak memberi feedback kepada pengguna.
12. Bucket ilustrasi bersifat publik dan belum memiliki cleanup lifecycle.
13. Error internal dan URL Supabase dikirim ke client pada beberapa kegagalan.
14. Halaman dan library ekspor dimuat secara eager sehingga bundle utama besar.
15. `GenerateExam.tsx`, `ReviewExam.tsx`, dan `src/lib/api.ts` terlalu besar dan mencampur banyak tanggung jawab.
16. Widget penjualan berlabel “Live” memakai data transaksi statis/fiktif; berisiko terhadap kepercayaan pengguna.

## Gap terhadap PRD

- PRD masih menyebut Laravel, MySQL, dan VPS, sedangkan implementasi aktif memakai Supabase/PostgreSQL/Edge Functions dan Vercel.
- Kurikulum Hybrid belum tersedia.
- Difficulty dan C1-C6 tidak lagi dapat dipilih; V1.2 memakai distribusi tetap.
- DOCX belum dibatasi untuk akun berbayar dan ekspor TXT belum tersedia.
- Kuota harian/bulanan belum diterapkan.
- Payment Mayar belum benar-benar diintegrasikan; frontend bahkan mereferensikan `billing-payment-status` yang tidak ada di repository.
- Referensi teks/PDF tidak menyimpan provenance seperti checksum, object path, atau metadata sumber.
- Folder Laravel lama mencakup lebih dari separuh tracked files dan meningkatkan risiko mengubah/deploy implementasi yang salah.

## Kekuatan

- RLS sudah aktif pada tabel inti dan policy read/delete/update soal menerapkan ownership.
- Edge Functions pengguna memvalidasi bearer token sebelum operasi service-role.
- Secret Supabase service role dan provider AI tetap berada di server.
- Output AI memiliki validasi struktur dan jumlah soal.
- Relasi database, cascading delete, index, dan trigger `updated_at` sudah tersedia.
- UI memiliki responsive layout, loading/empty state, konfirmasi hapus, dan disclaimer review guru.
- Production deployment terakhir di Vercel berhasil.

## Roadmap Rekomendasi

### Fase 1 — Security Hotfix

- Cabut akses UPDATE langsung pengguna terhadap kolom billing profil.
- Nonaktifkan pemberian benefit dari checkout sampai pembayaran terverifikasi tersedia.
- Implementasikan RPC transaksional untuk reserve/spend/refund kredit dengan row lock dan idempotency key.
- Perbaiki bug edit multiline.

### Fase 2 — Release Gate

- Sinkronkan lockfile dan upgrade/hapus dependency rentan.
- Selesaikan error lint.
- Tambahkan unit test, Supabase/RLS integration test, dan E2E untuk alur kritis.
- Tambahkan GitHub Actions untuk install, lint, build, test, dan security audit.

### Fase 3 — Billing dan Hardening

- Tambahkan `payment_orders`, checkout pending, webhook terverifikasi, payment status, dan fulfillment exactly-once.
- Terapkan schema validation, upload limits, rate limiting, error sanitization, CORS allowlist, serta private illustration storage.
- Tambahkan lifecycle generation, retry/recovery, dan artifact cleanup.

### Fase 4 — Product dan Maintainability

- Sinkronkan PRD/README dengan arsitektur aktif.
- Putuskan dan implementasikan kembali fitur Hybrid, pilihan C1-C6/difficulty, entitlement DOCX, TXT, dan quota.
- Pecah modul besar, gunakan generated Supabase types, lazy-load route/export, dan arsipkan atau hapus backend Laravel lama.

## Kesimpulan

Fitur prototype sudah luas dan build production berhasil, tetapi aplikasi **belum aman untuk billing production maupun enforcement kredit**. Prioritas pertama harus menutup celah RLS profil, menghentikan benefit checkout tanpa pembayaran, dan membuat akuntansi kredit transaksional sebelum menambah fitur baru.
