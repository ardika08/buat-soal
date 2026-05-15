# Deploy Supabase untuk Soalify

## 1. Buat Project Supabase

Di Supabase Dashboard, buat project baru. Simpan:

- Project URL
- anon public key
- service role key

## 2. Jalankan Migration SQL

Buka Supabase Dashboard -> SQL Editor, lalu jalankan isi file:

```text
supabase/migrations/20260515000000_initial_buat_soal_schema.sql
```

Migration ini membuat:

- `profiles`
- `credit_transactions`
- `exam_sessions`
- `questions`
- RLS policies
- trigger bonus 10 kredit untuk user baru
- storage bucket `question-illustrations`

## 3. Aktifkan Google Auth

Di Supabase Dashboard -> Authentication -> Providers -> Google:

- Enable Google provider
- Isi Client ID dan Client Secret dari Google Cloud
- Pastikan Client ID sama dengan `VITE_GOOGLE_CLIENT_ID`

Tambahkan authorized JavaScript origins di Google Cloud:

```text
https://buatsoal-fast.vercel.app
http://localhost:5173
```

## 4. Deploy Edge Functions

Install Supabase CLI, lalu login dan link project:

```bash
supabase login
supabase link --project-ref PROJECT_REF
```

Deploy functions:

```bash
supabase functions deploy exam-generate
supabase functions deploy billing-checkout
```

## 5. Isi Function Secrets

Minimal:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY
supabase secrets set GEMINI_API_KEY=GEMINI_API_KEY
supabase secrets set AI_FREE_PROVIDER=gemini
```

Jika fitur premium/OpenAI dan ilustrasi dipakai:

```bash
supabase secrets set OPENAI_API_KEY=OPENAI_API_KEY
supabase secrets set AI_PREMIUM_PROVIDER=openai
supabase secrets set OPENAI_PREMIUM_MODEL=gpt-5.4-mini
supabase secrets set OPENAI_IMAGE_MODEL=gpt-image-1
supabase secrets set OPENAI_IMAGE_SIZE=1024x1024
supabase secrets set OPENAI_IMAGE_QUALITY=low
supabase secrets set AI_MAX_ILLUSTRATIONS_PER_EXAM=5
```

## 6. Isi Environment Vercel

Di Vercel -> Project -> Settings -> Environment Variables:

```env
VITE_GOOGLE_CLIENT_ID=...
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Hapus env lama jika ada:

```env
VITE_API_BASE_URL
```

Lalu redeploy Vercel.

## 7. Tes Flow Utama

Tes berurutan:

1. Login Google
2. Cek kredit awal 10
3. Generate 1-3 soal dulu
4. Buka riwayat soal
5. Edit soal
6. Export PDF/DOCX
7. Top up simulasi billing
