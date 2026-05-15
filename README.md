# Soalify

Soalify memakai React + Vite untuk frontend, dengan Supabase untuk Auth, PostgreSQL, Storage, dan Edge Functions.

## Environment Frontend

Salin `.env.example` menjadi `.env`, lalu isi:

```env
VITE_GOOGLE_CLIENT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`VITE_GOOGLE_CLIENT_ID` harus sama dengan Google OAuth client yang diaktifkan di Supabase Auth.

## Supabase Setup

1. Buat project Supabase.
2. Jalankan SQL migration di folder `supabase/migrations`.
3. Enable Google provider di Supabase Auth.
4. Deploy Edge Functions:

```bash
supabase functions deploy exam-generate
supabase functions deploy billing-checkout
```

5. Isi Function Secrets:

```bash
supabase secrets set SERVICE_ROLE_KEY=...
supabase secrets set GEMINI_API_KEY=...
supabase secrets set OPENAI_API_KEY=...
supabase secrets set AI_FREE_PROVIDER=gemini
supabase secrets set AI_PREMIUM_PROVIDER=openai
```

## Menjalankan Lokal

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Backend Laravel lama tetap ada di folder `backend/` sebagai referensi, tetapi frontend sekarang menggunakan Supabase.
