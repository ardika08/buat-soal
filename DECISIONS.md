# DECISIONS — Ruang Kerja Guru (materi ajar)

Catatan keputusan teknis kecil yang diambil tanpa bertanya, sesuai AGENTS/instruksi
kerja ("kerja jangan tanya berlebihan; catat asumsi"). Keputusan besar yang butuh
persetujuan manusia dicatat eksplisit di bawah.

## Produk

- **Adopsi & perluas Soalify** (disetujui): kode lama dipakai ulang. Alur Soal dan
  E-Modul tetap sah. Fitur baru = **Proyek** (kontainer) + **Pipeline 5 tahap**
  (ATP → Rencana → Materi → Soal → Validasi).
- **Akses** (disetujui): generate memotong kredit (reserve/refund); fitur unduh &
  penuh mengikuti entitlement langganan (`resolveEbookEntitlement`, 402
  `upgrade_required`) yang sudah ada. Tidak ada perubahan harga di siklus ini.
- **Auth** (disetujui): Supabase Auth dengan **email + password + verifikasi email**
  + Google OAuth. Tidak ada auth kustom.
- **Pembayaran** (disetujui): **Midtrans** (snap + webhook signature SHA512),
  menggantikan Mayar. Kode Mayar dipertahankan sebagai jalur legacy sampai
  Midtrans terbukti di sandbox, agar order lama tidak hangus.

## Teknis (asumsi kecil)

1. **Proyek = satu pekerjaan guru.** Satu `projects` row per (jenjang, kelas, mapel,
   topik). Folder opsional lewat kolom `folder_id` yang menunjuk tabel `folders`.
2. **Tabel pipeline** memakai satu tabel `project_sections` bergaya `project_documents`?
   → **Keputusan:** `projects` + `project_stages` (status/progress per tahap 1..5)
   + `project_documents` (jenis: `atp`, `rencana`, `materi`, `soal`, `rubrik`).
   Dokumen menyimpan `content` (jsonb), `content_hash`, `status`.
3. **Materi per pertemuan** tidak punya tabel sendiri: `project_documents` jenis
   `materi` menyimpan `content.items[]` (satu item per pertemuan). Sederhana,
   cukup untuk MVP, mudah diekspor.
4. **Streaming T3**: Supabase Edge Function (Deno) tidak bisa mengalirkan SSE
   dengan andal lewat Supabase Functions (hanya response tunggal). **Keputusan MVP:**
   generate tanpa streaming teks; progres dilaporkan via status tahap + polling
   singkat di klien. Jalur streaming dicatat sebagai pekerjaan lanjutan (butuh
   fungsi Deno yang mengalirkan body chunked).
5. **Validasi otomatis (T5)** murni di kode (`_shared/validate.ts` + `src/lib/…`),
   diuji tanpa jaringan: struktur wajib per jenis dokumen + skor 0..100 + temuan.
6. **Kredit pipeline**: 1 kredit per tahap yang menghasilkan dokumen (T1–T4),
   minimum 1. Konstanta di `_shared/pipeline.ts` dan duplikasi yang diuji di
   `src/lib/pipeline.ts` (sama persis, diuji dengan tes).
7. **Export**: DOCX & PDF lewat `docx`/`pdf-lib` di Edge Function seperti e-modul.
   PPTX/XLSX **belum** dibuat (bukan bagian MVP wajib) — dicatat sebagai pekerjaan
   lanjutan dengan saran pustaka (`pptxgenjs`/`exceljs`).
8. **Publish publik** bersifat opsional di luar MVP daftar wajib; hanya disiapkan
   kolom `public_slug` + `public_shared_at` (tanpa endpoint publik di siklus ini).
9. **Admin**: peran `admin` ditambahkan ke `profiles.role` (default `teacher`).
   Semua endpoint admin memeriksa peran di server, bukan hanya menyembunyikan UI.
10. **Kepala sekolah/pengawas**: MVP hanya menyiapkan kolom `review_status` +
    `reviewed_by`; alur review lengkap di luar daftar MVP wajib.
11. **Onboarding**: tabel `teacher_profiles` (jenjang & mapel yang diampu), dipakai
    preselect wizard. Bisa dilewati (skip) dan diubah dari Profil.
12. **Nama produk** tetap "Soalify" (tidak ada keputusan rebrand).

## Yang tidak dikerjakan tanpa keputusan manusia

- Harga/paket berbayar dan besaran kredit (uang).
- Isi `.env`/secret (GEMINI_API_KEY, OPENAI_API_KEY, MIDTRANS_SERVER_KEY/CLIENT_KEY).
- Rebrand/nama domain.
