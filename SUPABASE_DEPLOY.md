# Deploy Supabase untuk Soalify

> **PENTING (P0 Security Hotfix):** migration `20260912000000_p0_security_hotfix.sql`
> **wajib** dijalankan setelah schema awal. Sebelum migration ini dijalankan, pengguna
> dapat menaikkan saldo kredit sendiri lewat Data API dan checkout memberi kredit tanpa
> pembayaran nyata. Urutan langkah di bawah sudah benar — jangan dilewati.

## 1. Buat Project Supabase

Di Supabase Dashboard, buat project baru. Simpan:

- Project URL
- anon public key
- service role key

## 2. Jalankan Migration SQL

Buka Supabase Dashboard -> SQL Editor, lalu jalankan **berurutan**:

```text
1. supabase/migrations/20260515000000_initial_buat_soal_schema.sql
2. supabase/migrations/20260912000000_p0_security_hotfix.sql
3. supabase/migrations/20260912010000_p1_billing_lifecycle.sql
4. supabase/migrations/20260913000000_create_exam_transaction_function.sql
```

Jalankan setiap migration **hanya setelah** migration sebelumnya selesai tanpa error.

Migration pertama membuat `profiles`, `credit_transactions`, `exam_sessions`, `questions`,
RLS policy, trigger bonus 10 kredit, dan storage bucket `question-illustrations`.

Migration P0 (`20260912000000_p0_security_hotfix.sql`) menutup temuan audit:

- mencabut `update`/`insert`/`delete` pada `profiles` dari `anon` & `authenticated`
  (pengguna tidak bisa lagi menaikkan `credits_balance` / `subscription_tier` sendiri);
- menggantinya dengan RPC `update_own_profile(p_name text)` — hanya boleh mengubah nama;
- mencabut tulis pada `credit_transactions` (ledger hanya bisa ditulis lewat fungsi);
- membuat `payment_orders` (order pembayaran + idempotency via unique index parsial);
- membuat `spend_credits`, `refund_credits`, `create_exam_with_credits`, `fulfill_payment_order`
  — semuanya `SECURITY DEFINER`, memakai `SELECT ... FOR UPDATE`, idempoten, dan hanya
  dapat dieksekusi `service_role`.

Migration P1 (`20260912010000_p1_billing_lifecycle.sql`) melengkapi siklus hidup billing:

- `expire_subscriptions()` — menurunkan premium yang sudah lewat `subscription_expiry` ke
  `free`. Tanpa ini, status premium tidak pernah turun (hanya akses AI yang dicek saat
  generate). Kredit yang sudah dibeli **tidak** dihapus — hanya akses premium yang dicabut.
- `expire_stale_payment_orders(ttl)` — menutup order `pending` yang menggantung
  (default 1440 menit) agar tabel order tidak menumpuk.
- `orders_for_reconciliation(limit, days)` — daftar order yang webhook-nya kemungkinan
  hilang, untuk direkonsiliasi ulang ke Mayar.

Ketiganya hanya dapat dieksekusi `service_role` (klien tidak bisa memicu pembersihan).

## 3. Verifikasi Migration Secara Lokal (opsional, tanpa Supabase)

Test dijalankan di Postgres lokal via PGlite — tidak perlu Docker:

```bash
npm ci
npm test
```

Harus **71/71 pass** (`npm run test:security` 14 uji, `npm run test:lifecycle` 16 uji,
`npm run test:billing` 12 uji, `npm run test:api` 22 uji pemetaan data, sisanya uji
anti-drift harga). Test ini menyerang jalur asli (menaikkan kredit lewat update profil,
memanggil RPC kredit dari klien, webhook berulang, order yang dibayar setelah kedaluwarsa)
dan memastikan semuanya gagal/aman.

### Gate rilis

`npm ci` dipakai (bukan `npm install`) karena perintah itu **gagal bila `package.json`
dan `package-lock.json` tidak sinkron** — kondisi yang membuat deploy produksi berbeda
dari yang diuji. Sebelum rilis, keempat perintah ini harus lulus:

```bash
npm ci --ignore-scripts          # lockfile sinkron
npm run lint                     # 0 error, 0 warning
npm run build                    # typecheck + build bersih
npm test                         # 71/71 lulus
npm audit --omit=dev --audit-level=high   # tanpa kerentanan high/critical
```

Semuanya sudah berjalan otomatis di `.github/workflows/ci.yml` untuk setiap push ke
`main` dan setiap pull request.

## 4. Aktifkan Google Auth

Di Supabase Dashboard -> Authentication -> Providers -> Google:

- Enable Google provider
- Isi Client ID dan Client Secret dari Google Cloud
- Pastikan Client ID sama dengan `VITE_GOOGLE_CLIENT_ID`

Tambahkan authorized JavaScript origins di Google Cloud:

```text
https://buatsoal-fast.vercel.app
http://localhost:5173
```

## 5. Deploy Edge Functions

Install Supabase CLI, lalu login dan link project:

```bash
supabase login
supabase link --project-ref PROJECT_REF
```

Deploy functions:

```bash
supabase functions deploy exam-generate
supabase functions deploy billing-checkout
supabase functions deploy billing-payment-status
supabase functions deploy billing-webhook --no-verify-jwt
supabase functions deploy billing-reconcile --no-verify-jwt
```

Catatan: `billing-webhook` dipanggil Mayar (bukan user), jadi **tidak boleh** memakai
verifikasi JWT Supabase — aksesnya dijaga oleh `MAYAR_WEBHOOK_SECRET` + verifikasi ulang
status invoice ke API Mayar.

`billing-reconcile` juga tanpa JWT karena dipanggil penjadwal (cron), bukan user. Aksesnya
dijaga `BILLING_RECONCILE_TOKEN`, dan endpoint menolak semua permintaan bila token belum
di-set (fail-closed) — fungsi ini bisa memberi kredit, jadi tidak boleh terbuka by default.

## 6. Isi Function Secrets

Minimal:

```bash
supabase secrets set SERVICE_ROLE_KEY=SERVICE_ROLE_KEY
supabase secrets set GEMINI_API_KEY=GEMINI_API_KEY
supabase secrets set AI_FREE_PROVIDER=gemini
```

Billing Mayar (wajib untuk top up):

```bash
supabase secrets set MAYAR_API_KEY=MAYAR_API_KEY
supabase secrets set MAYAR_MODE=production      # atau: sandbox
supabase secrets set MAYAR_WEBHOOK_SECRET=RANDOM_TOKEN_PANJANG
supabase secrets set APP_BASE_URL=https://buatsoal-fast.vercel.app
```

`MAYAR_WEBHOOK_SECRET` bukan dari Mayar — kita yang membuatnya dan menyisipkannya ke URL
webhook (lihat langkah 8).

Rekonsiliasi terjadwal (pengaman bila webhook hilang):

```bash
supabase secrets set BILLING_RECONCILE_TOKEN=RANDOM_TOKEN_PANJANG
```

Token ini **wajib**. Tanpa nilainya, `billing-reconcile` menolak semua permintaan (503)
sehingga tidak ada yang bisa memicunya sembarangan.

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

## 7. Isi Environment Vercel

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

## 8. Daftarkan Webhook Mayar

Di dashboard Mayar -> Integration -> Webhook, set URL:

```text
https://PROJECT_REF.supabase.co/functions/v1/billing-webhook?token=MAYAR_WEBHOOK_SECRET
```

`MAYAR_WEBHOOK_SECRET` harus sama persis dengan nilai yang di-set di langkah 6.

Alur pemenuhan benefit:

1. Pengguna klik top up -> `billing-checkout` membuat baris `payment_orders` berstatus
   `pending` + invoice Mayar. **Belum ada kredit yang diberikan.**
2. Setelah bayar, Mayar memanggil `billing-webhook`.
3. Webhook **tidak mempercayai payload**-nya. Ia memverifikasi token, lalu memanggil
   `GET /invoice/{id}` ke API Mayar untuk memastikan status sebenarnya.
4. Bila Mayar menyatakan `paid`, `fulfill_payment_order` mengunci baris order
   (`SELECT ... FOR UPDATE`) dan memberi kredit/premium **tepat satu kali** — webhook
   berulang atau replay aman karena idempoten.
5. `billing-payment-status` (dipanggil frontend saat pengguna kembali dari Mayar)
   memakai RPC yang sama sebagai jaring pengaman bila webhook telat/gagal.

## 9. Jadwalkan Rekonsiliasi (wajib untuk siklus hidup billing)

Tanpa langkah ini, premium yang kedaluwarsa **tidak akan pernah turun** ke `free` dan order
pending akan menumpuk — tidak ada yang menjalankan pembersihannya.

Buat penjadwal yang memanggil `billing-reconcile` tiap 30 menit. Bisa lewat
[pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron) di SQL Editor:

```sql
-- Jalankan setelah ekstensi pg_cron aktif (Database -> Extensions -> pg_cron)
select cron.schedule(
  'billing-reconcile',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/billing-reconcile',
    headers := '{"Content-Type":"application/json","x-reconcile-token":"BILLING_RECONCILE_TOKEN"}'::jsonb
  );
  $$
);
```

Alternatif tanpa pg_cron: cron eksternal (GitHub Actions / cron-job.org) yang mengirim
`POST` ke URL yang sama dengan header `x-reconcile-token`.

Setiap pemanggilan melakukan tiga hal berurutan:

1. `expire_subscriptions` — premium lewat masa berlaku diturunkan ke `free`;
2. `expire_stale_payment_orders` — order pending lebih tua dari 24 jam ditutup;
3. rekonsiliasi tiap order pending/expired ke Mayar; order yang ternyata sudah lunas
   dipenuhi lewat RPC idempoten yang sama.

Hasilnya bisa dicek dari respons JSON (`sweeps`, `fulfilled`, `errors`).

## 10. Tes Flow Utama

Tes berurutan:

1. Login Google
2. Cek kredit awal 10
3. Generate 1-3 soal dulu
4. Buka riwayat soal
5. Edit soal — termasuk soal dengan isi **multiline** (pastikan mengedit baris pertama
   tidak menghapus baris berikutnya)
6. Export PDF/DOCX
7. Top up: pastikan kredit **tidak** bertambah sebelum pembayaran benar-benar lunas
8. Setelah bayar di Mayar, pastikan kredit bertambah **tepat sekali** (refresh berkali-kali
   tidak menambah kredit lagi)
9. Pastikan halaman `/billing/return` menampilkan status pesanan (bukan dashboard tanpa
   penjelasan) setelah kembali dari Mayar
10. Uji langganan kedaluwarsa: set `subscription_expiry` ke waktu lampau, panggil
    `billing-reconcile`, lalu pastikan `subscription_tier` turun ke `free` **tanpa**
    mengurangi `credits_balance`
