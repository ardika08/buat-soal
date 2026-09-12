// Verifikasi P0 Security Hotfix.
//
// Menjalankan skema asli + migration P0 di Postgres lokal (PGlite), lalu
// menguji jalur serangan dan invarian transaksional yang diklaim migration.
//
// Jalankan: npm run test:security

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const HARNESS = join(root, "supabase", "tests", "harness.sql");
const MIGRATIONS = [
  join(root, "supabase", "migrations", "20260515000000_initial_buat_soal_schema.sql"),
  join(root, "supabase", "migrations", "20260912000000_p0_security_hotfix.sql"),
];

// PGlite tidak punya paket extension pgcrypto, tetapi gen_random_uuid() sudah tersedia di core.
// Di Supabase extension ini aktif, jadi menghapus barisnya di harness lokal tidak mengubah perilaku.
function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

let db;
let profileA;
let profileB;

/** Menjalankan query sebagai pengguna terautentikasi (RLS aktif). */
async function asUser(authUserId, sql, params) {
  await db.exec("reset role");
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [authUserId]);
  await db.exec("set role authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

/** Menjalankan query sebagai server (service role: bypass RLS). */
async function asService(sql, params) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  return db.query(sql, params);
}

/** Menjalankan query yang harus gagal; mengembalikan pesan error. */
async function expectFailure(fn) {
  try {
    await fn();
  } catch (error) {
    return String(error?.message ?? error);
  }
  throw new Error("Query seharusnya gagal, tetapi berhasil.");
}

async function createUser(id, email, name) {
  await asService("select set_config('request.jwt.claim.sub', '', false)");
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
    id,
    email,
    JSON.stringify({ name }),
  ]);
  const { rows } = await db.query("select * from public.profiles where auth_user_id = $1", [id]);
  return rows[0];
}

async function balance(profileId) {
  const { rows } = await db.query("select credits_balance from public.profiles where id = $1", [profileId]);
  return Number(rows[0].credits_balance);
}

async function ledger(profileId) {
  const { rows } = await db.query(
    "select type, amount, idempotency_key from public.credit_transactions where user_id = $1 order by id",
    [profileId],
  );
  return rows;
}

before(async () => {
  db = new PGlite();
  await db.exec(prepareSql(readFileSync(HARNESS, "utf8")));
  for (const file of MIGRATIONS) {
    await db.exec(prepareSql(readFileSync(file, "utf8")));
  }
  profileA = await createUser(USER_A, "a@example.com", "Guru A");
  profileB = await createUser(USER_B, "b@example.com", "Guru B");
});

after(async () => {
  await db?.close();
});

// ---------------------------------------------------------------------------
// 1. Manipulasi kredit lewat Data API
// ---------------------------------------------------------------------------

test("pengguna tidak dapat menaikkan kredit_balance sendiri lewat update profil", async () => {
  const error = await expectFailure(() =>
    asUser(USER_A, "update public.profiles set credits_balance = 999999 where id = $1", [profileA.id]),
  );
  assert.match(error, /permission denied/i, `harus ditolak izin, dapat: ${error}`);
  assert.equal(await balance(profileA.id), 10);
});

test("pengguna tidak dapat mengubah subscription_tier / expiry sendiri", async () => {
  const tierError = await expectFailure(() =>
    asUser(USER_A, "update public.profiles set subscription_tier = 'premium' where id = $1", [profileA.id]),
  );
  const expiryError = await expectFailure(() =>
    asUser(USER_A, "update public.profiles set subscription_expiry = now() + interval '99 years' where id = $1", [
      profileA.id,
    ]),
  );
  assert.match(tierError, /permission denied/i);
  assert.match(expiryError, /permission denied/i);

  const { rows } = await asService(
    "select subscription_tier, subscription_expiry from public.profiles where id = $1",
    [profileA.id],
  );
  assert.equal(rows[0].subscription_tier, "free");
  assert.equal(rows[0].subscription_expiry, null);
});

test("pengguna tidak dapat menyisipkan / menghapus baris ledger atau profil", async () => {
  const insertError = await expectFailure(() =>
    asUser(USER_A, "insert into public.credit_transactions (user_id, type, amount) values ($1, 'topup', 500)", [
      profileA.id,
    ]),
  );
  const deleteError = await expectFailure(() =>
    asUser(USER_A, "delete from public.credit_transactions where user_id = $1", [profileA.id]),
  );
  assert.match(insertError, /permission denied/i);
  assert.match(deleteError, /permission denied/i);
  assert.equal((await ledger(profileA.id)).length, 1);
});

test("update_own_profile hanya mengubah nama, kredit tetap", async () => {
  const before = await balance(profileA.id);
  const { rows } = await asUser(USER_A, "select public.update_own_profile($1) as profile", ["Guru A Baru"]);
  assert.equal(rows[0].profile.name, "Guru A Baru");
  assert.equal(await balance(profileA.id), before);

  const shortError = await expectFailure(() => asUser(USER_A, "select public.update_own_profile($1)", ["a"]));
  assert.match(shortError, /minimal 2 karakter/i);
});

test("pengguna tidak dapat memanggil RPC kredit", async () => {
  const spendError = await expectFailure(() =>
    asUser(USER_A, "select public.spend_credits($1, 5, 'client-key-0001')", [profileA.id]),
  );
  const fulfillError = await expectFailure(() =>
    asUser(USER_A, "select public.fulfill_payment_order(1, 'paid')"),
  );
  assert.match(spendError, /permission denied/i);
  assert.match(fulfillError, /permission denied/i);
  assert.equal(await balance(profileA.id), 10);
});

// ---------------------------------------------------------------------------
// 2. Kredit transaksional
// ---------------------------------------------------------------------------

test("spend_credits memotong saldo, menulis ledger, dan idempoten", async () => {
  await asService("update public.profiles set credits_balance = 50 where id = $1", [profileA.id]);

  const first = await asService("select public.spend_credits($1, 5, 'spend-key-0001', 'test') as r", [profileA.id]);
  assert.equal(first.rows[0].r.applied, true);
  assert.equal(Number(first.rows[0].r.credits_balance), 45);

  const replay = await asService("select public.spend_credits($1, 5, 'spend-key-0001', 'test') as r", [profileA.id]);
  assert.equal(replay.rows[0].r.applied, false);
  assert.equal(replay.rows[0].r.reason, "duplicate");
  assert.equal(await balance(profileA.id), 45, "pemanggilan ulang tidak boleh memotong lagi");

  const deductions = (await ledger(profileA.id)).filter((row) => row.idempotency_key === "spend-key-0001");
  assert.equal(deductions.length, 1);
});

test("spend_credits menolak saldo kurang tanpa mengubah apa pun", async () => {
  const before = await balance(profileA.id);
  const error = await expectFailure(() =>
    asService("select public.spend_credits($1, 100000, 'spend-key-0002')", [profileA.id]),
  );
  assert.match(error, /insufficient_credits/);
  assert.equal(await balance(profileA.id), before);
  assert.equal((await ledger(profileA.id)).some((row) => row.idempotency_key === "spend-key-0002"), false);
});

test("create_exam_with_credits atomik dan idempoten", async () => {
  await asService("update public.profiles set credits_balance = 30 where id = $1", [profileB.id]);

  const exam = {
    curriculum: "Kurikulum Merdeka",
    exam_type: "Ulangan Harian",
    class_phase: "Fase D",
    subject: "Matematika",
    semester: "Ganjil",
    time_allocation: 90,
    reference_type: "AI",
    difficulty: "Campuran Berimbang",
    cognitive_levels: ["C1", "C2"],
    pg_options: "4",
    include_illustration: false,
    topics: ["Bilangan"],
  };
  const questions = [
    { order_number: 1, question_type: "Pilihan Ganda", question_content: "1 + 1 = ?", correct_answer: "2" },
    { order_number: 2, question_type: "Pilihan Ganda", question_content: "2 + 2 = ?", correct_answer: "4" },
    { order_number: 3, question_type: "Pilihan Ganda", question_content: "3 + 3 = ?", correct_answer: "6" },
  ];

  const created = await asService(
    "select public.create_exam_with_credits($1, $2::jsonb, $3::jsonb, 'exam-key-0001') as r",
    [profileB.id, JSON.stringify(exam), JSON.stringify(questions)],
  );
  assert.equal(created.rows[0].r.applied, true);
  assert.equal(Number(created.rows[0].r.credits_balance), 27, "3 soal = 3 kredit");
  assert.equal(created.rows[0].r.questions.length, 3);

  const replay = await asService(
    "select public.create_exam_with_credits($1, $2::jsonb, $3::jsonb, 'exam-key-0001') as r",
    [profileB.id, JSON.stringify(exam), JSON.stringify(questions)],
  );
  assert.equal(replay.rows[0].r.applied, false);
  assert.equal(replay.rows[0].r.reason, "duplicate");
  assert.equal(Number(replay.rows[0].r.exam.id), Number(created.rows[0].r.exam.id));
  assert.equal(replay.rows[0].r.questions.length, 3);
  assert.equal(await balance(profileB.id), 27, "replay tidak boleh memotong ulang");

  const exams = await asService("select count(*)::int as n from public.exam_sessions where user_id = $1", [profileB.id]);
  assert.equal(exams.rows[0].n, 1);

  const failBefore = await balance(profileB.id);
  const examCountBefore = exams.rows[0].n;
  const error = await expectFailure(() =>
    asService("select public.create_exam_with_credits($1, $2::jsonb, $3::jsonb, 'exam-key-0002')", [
      profileB.id,
      JSON.stringify(exam),
      JSON.stringify(Array.from({ length: 500 }, (_v, i) => ({ order_number: i + 1, question_content: "x" }))),
    ]),
  );
  assert.match(error, /insufficient_credits/);

  const after = await asService("select count(*)::int as n from public.exam_sessions where user_id = $1", [profileB.id]);
  assert.equal(after.rows[0].n, examCountBefore, "kegagalan kredit tidak boleh meninggalkan sesi ujian");
  assert.equal(await balance(profileB.id), failBefore);
});

test("refund_credits mengembalikan kredit secara idempoten", async () => {
  const before = await balance(profileB.id);
  const first = await asService("select public.refund_credits($1, 3, 'refund-key-0001', 'rollback') as r", [profileB.id]);
  assert.equal(first.rows[0].r.applied, true);
  assert.equal(Number(first.rows[0].r.credits_balance), before + 3);

  const replay = await asService("select public.refund_credits($1, 3, 'refund-key-0001', 'rollback') as r", [
    profileB.id,
  ]);
  assert.equal(replay.rows[0].r.applied, false);
  assert.equal(await balance(profileB.id), before + 3);
});

// ---------------------------------------------------------------------------
// 3. Pemenuhan pembayaran exactly-once
// ---------------------------------------------------------------------------

async function createOrder(profileId, { type = "topup", credits = 100, months = null, status = "pending" } = {}) {
  const { rows } = await asService(
    `insert into public.payment_orders (user_id, package_id, order_type, provider_order_id, status, amount, credits, duration_months)
     values ($1, $2, $3, $4, $5, 50000, $6, $7) returning *`,
    [profileId, "test-package", type, `mayar-${Math.random().toString(36).slice(2)}`, status, credits, months],
  );
  return rows[0];
}

test("fulfill_payment_order memberi kredit sekali saja walau webhook berulang", async () => {
  const order = await createOrder(profileB.id, { type: "topup", credits: 100 });
  const before = await balance(profileB.id);

  const first = await asService("select public.fulfill_payment_order($1, 'paid', 'tx-1') as r", [order.id]);
  assert.equal(first.rows[0].r.applied, true);
  assert.equal(Number(first.rows[0].r.credits_granted), 100);
  assert.equal(await balance(profileB.id), before + 100);

  const replay = await asService("select public.fulfill_payment_order($1, 'paid', 'tx-1') as r", [order.id]);
  assert.equal(replay.rows[0].r.applied, false);
  assert.equal(replay.rows[0].r.reason, "already_paid");
  assert.equal(await balance(profileB.id), before + 100, "webhook berulang tidak boleh menambah kredit lagi");

  const granted = (await ledger(profileB.id)).filter((row) => row.idempotency_key === `payment_order:${order.id}`);
  assert.equal(granted.length, 1);

  const { rows } = await asService("select status, fulfilled_at, credits_granted from public.payment_orders where id = $1", [
    order.id,
  ]);
  assert.equal(rows[0].status, "paid");
  assert.notEqual(rows[0].fulfilled_at, null);
  assert.equal(Number(rows[0].credits_granted), 100);
});

test("fulfill_payment_order tidak memberi benefit untuk status belum dibayar", async () => {
  const order = await createOrder(profileB.id, { type: "subscription", credits: 200, months: 1 });
  const before = await balance(profileB.id);

  const pending = await asService("select public.fulfill_payment_order($1, 'pending') as r", [order.id]);
  assert.equal(pending.rows[0].r.applied, false);
  assert.equal(await balance(profileB.id), before);

  const expired = await asService("select public.fulfill_payment_order($1, 'expired') as r", [order.id]);
  assert.equal(expired.rows[0].r.applied, false);
  assert.equal(expired.rows[0].r.status, "expired");
  assert.equal(await balance(profileB.id), before);
  assert.equal((await ledger(profileB.id)).some((row) => row.idempotency_key === `payment_order:${order.id}`), false);
});

test("fulfill_payment_order mengaktifkan premium dan memperpanjang langganan", async () => {
  await asService("update public.profiles set credits_balance = 0, subscription_tier = 'free', subscription_expiry = null where id = $1", [
    profileB.id,
  ]);

  const first = await createOrder(profileB.id, { type: "subscription", credits: 50, months: 1 });
  const one = await asService("select public.fulfill_payment_order($1, 'paid') as r", [first.id]);
  assert.equal(one.rows[0].r.applied, true);
  assert.equal(one.rows[0].r.profile.subscription_tier, "premium");
  assert.equal(Number(one.rows[0].r.profile.credits_balance), 50);

  const { rows } = await asService("select subscription_expiry from public.profiles where id = $1", [profileB.id]);
  const firstExpiry = new Date(rows[0].subscription_expiry).getTime();
  assert.ok(firstExpiry > Date.now(), "expiry harus di masa depan");

  const second = await createOrder(profileB.id, { type: "subscription", credits: 50, months: 1 });
  await asService("select public.fulfill_payment_order($1, 'paid') as r", [second.id]);

  const after = await asService("select subscription_expiry from public.profiles where id = $1", [profileB.id]);
  const secondExpiry = new Date(after.rows[0].subscription_expiry).getTime();
  assert.ok(secondExpiry > firstExpiry, "langganan aktif harus diperpanjang, bukan direset");
});

test("pengguna hanya dapat membaca order miliknya sendiri", async () => {
  const { rows } = await asUser(USER_B, "select count(*)::int as n from public.payment_orders");
  assert.ok(rows[0].n >= 1, "pemilik melihat ordernya");

  const other = await asUser(USER_A, "select count(*)::int as n from public.payment_orders");
  assert.equal(other.rows[0].n, 0, "pengguna lain tidak melihat order tersebut");
});

test("pengguna tidak dapat menulis order pembayaran", async () => {
  const error = await expectFailure(() =>
    asUser(USER_B, "insert into public.payment_orders (user_id, package_id, order_type, amount, credits) values ($1, 'x', 'topup', 1, 1)", [
      profileB.id,
    ]),
  );
  assert.match(error, /permission denied/i);
});
