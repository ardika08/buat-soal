// Verifikasi siklus hidup billing (P1).
//
// Menjalankan skema asli + migration P0 + P1 di Postgres lokal (PGlite), lalu menguji
// invarian yang tidak dijaga oleh P0:
//   - langganan premium yang sudah lewat masa berlaku harus turun kembali ke free
//   - order pending yang kedaluwarsa harus ditutup supaya tidak menumpuk
//   - order yang layak direkonsiliasi (webhook tidak pernah sampai) harus bisa ditemukan
//   - uang yang sudah masuk tetap diberikan walau order sempat ditandai expired
//
// Jalankan: npm run test:billing-lifecycle

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
  join(root, "supabase", "migrations", "20260912010000_p1_billing_lifecycle.sql"),
];

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const DAY_MS = 24 * 60 * 60 * 1000;

let db;
let profileA;
let profileB;

/** Menjalankan query sebagai server (service role: bypass RLS). */
async function asService(sql, params) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  return db.query(sql, params);
}

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

async function createUser(id, email, name) {
  await asService("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
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

async function profileState(profileId) {
  const { rows } = await db.query(
    "select subscription_tier, subscription_expiry, credits_balance from public.profiles where id = $1",
    [profileId],
  );
  return rows[0];
}

/** Membuat order pembayaran dengan waktu pembuatan yang bisa digeser ke masa lalu. */
async function createOrder({
  profileId,
  status = "pending",
  credits = 50,
  amount = 25000,
  orderType = "topup",
  durationMonths = null,
  providerOrderId = null,
  ageHours = 0,
  packageId = "topup-50",
}) {
  const { rows } = await db.query(
    `insert into public.payment_orders (
       user_id, package_id, order_type, provider, provider_order_id, status,
       amount, credits, duration_months, created_at
     ) values (
       $1, $2, $3, 'mayar', $4, $5, $6, $7, $8, now() - make_interval(hours => $9)
     ) returning *`,
    [profileId, packageId, orderType, providerOrderId, status, amount, credits, durationMonths, ageHours],
  );
  return rows[0];
}

async function setPremium(profileId, expirySql) {
  await db.query(
    `update public.profiles
        set subscription_tier = 'premium', subscription_expiry = ${expirySql}
      where id = $1`,
    [profileId],
  );
}

before(async () => {
  db = new PGlite();
  await db.exec(prepareSql(readFileSync(HARNESS, "utf8")));
  for (const path of MIGRATIONS) {
    await db.exec(prepareSql(readFileSync(path, "utf8")));
  }

  profileA = await createUser(USER_A, "a@example.com", "Guru A");
  profileB = await createUser(USER_B, "b@example.com", "Guru B");
});

after(async () => {
  await db?.close();
});

// ---------------------------------------------------------------------------
// 1. Langganan kedaluwarsa harus turun kembali ke free
// ---------------------------------------------------------------------------

test("expire_subscriptions menurunkan premium yang sudah lewat masa berlaku", async () => {
  await setPremium(profileA.id, "now() - interval '1 day'");

  const { rows } = await db.query("select public.expire_subscriptions() as result");
  const result = rows[0].result;

  assert.ok(Number(result.expired_count) >= 1, "minimal satu langganan harus kedaluwarsa");

  const state = await profileState(profileA.id);
  assert.equal(state.subscription_tier, "free", "tier harus turun ke free");
  assert.equal(state.subscription_expiry, null, "tanggal kedaluwarsa harus dibersihkan");
});

test("expire_subscriptions tidak menyentuh langganan yang masih aktif", async () => {
  await setPremium(profileB.id, "now() + interval '10 days'");

  await db.query("select public.expire_subscriptions()");

  const state = await profileState(profileB.id);
  assert.equal(state.subscription_tier, "premium", "langganan aktif tidak boleh diturunkan");
  assert.ok(state.subscription_expiry, "tanggal kedaluwarsa harus tetap ada");
});

test("expire_subscriptions mengabaikan premium tanpa tanggal kedaluwarsa", async () => {
  // Premium tanpa expiry berarti berlaku selamanya — jangan pernah diturunkan.
  await setPremium(profileB.id, "null");

  await db.query("select public.expire_subscriptions()");

  const state = await profileState(profileB.id);
  assert.equal(state.subscription_tier, "premium", "premium tanpa expiry tidak boleh diturunkan");

  await setPremium(profileB.id, "now() + interval '10 days'");
});

test("expire_subscriptions tidak mengubah saldo kredit", async () => {
  await setPremium(profileA.id, "now() - interval '2 days'");
  const before = await balance(profileA.id);

  await db.query("select public.expire_subscriptions()");

  assert.equal(await balance(profileA.id), before, "menurunkan tier tidak boleh menghapus kredit");
});

test("expire_subscriptions idempoten", async () => {
  await setPremium(profileA.id, "now() - interval '2 days'");

  const { rows: firstRun } = await db.query("select public.expire_subscriptions() as result");
  const { rows: secondRun } = await db.query("select public.expire_subscriptions() as result");

  assert.ok(Number(firstRun[0].result.expired_count) >= 1, "jalan pertama harus menurunkan");
  assert.equal(Number(secondRun[0].result.expired_count), 0, "jalan kedua tidak boleh ada yang tersisa");
});

// ---------------------------------------------------------------------------
// 2. Order pending yang kedaluwarsa
// ---------------------------------------------------------------------------

test("expire_stale_payment_orders menandai order pending yang sudah lewat TTL", async () => {
  const stale = await createOrder({ profileId: profileA.id, ageHours: 48, providerOrderId: "inv-stale" });

  await db.query("select public.expire_stale_payment_orders(1440)");

  const { rows } = await db.query("select status from public.payment_orders where id = $1", [stale.id]);
  assert.equal(rows[0].status, "expired", "order lama harus ditutup");
});

test("expire_stale_payment_orders tidak menyentuh order yang masih baru", async () => {
  const fresh = await createOrder({ profileId: profileA.id, ageHours: 1, providerOrderId: "inv-fresh" });

  await db.query("select public.expire_stale_payment_orders(1440)");

  const { rows } = await db.query("select status from public.payment_orders where id = $1", [fresh.id]);
  assert.equal(rows[0].status, "pending", "order baru harus tetap terbuka");
});

test("expire_stale_payment_orders tidak pernah mengubah order yang sudah dibayar", async () => {
  const paid = await createOrder({ profileId: profileA.id, status: "paid", ageHours: 500, providerOrderId: "inv-paid" });

  await db.query("select public.expire_stale_payment_orders(1440)");

  const { rows } = await db.query("select status from public.payment_orders where id = $1", [paid.id]);
  assert.equal(rows[0].status, "paid", "order lunas tidak boleh diubah menjadi expired");
});

// ---------------------------------------------------------------------------
// 3. Rekonsiliasi webhook yang hilang
// ---------------------------------------------------------------------------

test("orders_for_reconciliation mengembalikan order pending dan expired yang punya invoice", async () => {
  await db.query("delete from public.payment_orders where user_id = $1", [profileA.id]);

  const waiting = await createOrder({ profileId: profileA.id, ageHours: 2, providerOrderId: "inv-1" });
  const expired = await createOrder({ profileId: profileA.id, status: "expired", ageHours: 30, providerOrderId: "inv-2" });

  const { rows } = await db.query("select public.orders_for_reconciliation(50, 7) as result");
  const candidates = rows[0].result.orders;
  const ids = candidates.map((item) => Number(item.id));

  assert.ok(ids.includes(Number(waiting.id)), "order pending harus ikut direkonsiliasi");
  assert.ok(ids.includes(Number(expired.id)), "order expired harus ikut direkonsiliasi (pembayaran bisa telat masuk)");
});

test("orders_for_reconciliation mengabaikan order tanpa invoice dan order yang sudah lunas", async () => {
  await db.query("delete from public.payment_orders where user_id = $1", [profileA.id]);

  await createOrder({ profileId: profileA.id, ageHours: 2, providerOrderId: null });
  await createOrder({ profileId: profileA.id, status: "paid", ageHours: 2, providerOrderId: "inv-paid-2" });

  const { rows } = await db.query("select public.orders_for_reconciliation(50, 7) as result");
  assert.equal(rows[0].result.orders.length, 0, "tanpa invoice atau sudah lunas tidak perlu dicek ulang");
});

test("orders_for_reconciliation mengabaikan order di luar jendela waktu", async () => {
  await db.query("delete from public.payment_orders where user_id = $1", [profileA.id]);

  await createOrder({ profileId: profileA.id, ageHours: 24 * 30, providerOrderId: "inv-ancient" });

  const { rows } = await db.query("select public.orders_for_reconciliation(50, 7) as result");
  assert.equal(rows[0].result.orders.length, 0, "order terlalu lama tidak perlu dicek ulang");
});

test("orders_for_reconciliation menghormati batas jumlah", async () => {
  await db.query("delete from public.payment_orders where user_id = $1", [profileA.id]);

  for (let index = 0; index < 5; index++) {
    await createOrder({ profileId: profileA.id, ageHours: index + 1, providerOrderId: `inv-limit-${index}` });
  }

  const { rows } = await db.query("select public.orders_for_reconciliation(2, 7) as result");
  assert.equal(rows[0].result.orders.length, 2, "batas jumlah harus dipatuhi");
});

// ---------------------------------------------------------------------------
// 4. Uang yang sudah masuk tidak boleh hilang
// ---------------------------------------------------------------------------

test("order yang sempat expired tetap dipenuhi bila ternyata dibayar", async () => {
  await db.query("delete from public.payment_orders where user_id = $1", [profileA.id]);
  await db.query("update public.profiles set credits_balance = 0 where id = $1", [profileA.id]);

  const order = await createOrder({ profileId: profileA.id, ageHours: 48, credits: 50, providerOrderId: "inv-late" });

  // Sweep menutupnya lebih dulu (webhook belum sampai).
  await db.query("select public.expire_stale_payment_orders(1440)");

  // Lalu Mayar menyatakan invoice ini benar-benar lunas.
  const { rows } = await db.query(
    "select public.fulfill_payment_order($1, 'paid', 'trx-late') as result",
    [order.id],
  );

  assert.equal(rows[0].result.applied, true, "pembayaran telat harus tetap dipenuhi");
  assert.equal(await balance(profileA.id), 50, "kredit harus masuk walau order sempat expired");

  const { rows: orderRows } = await db.query("select status, fulfilled_at from public.payment_orders where id = $1", [order.id]);
  assert.equal(orderRows[0].status, "paid", "order harus ditandai lunas");
  assert.ok(orderRows[0].fulfilled_at, "waktu pemenuhan harus dicatat");
});

test("memenuhi order dua kali tidak menggandakan kredit", async () => {
  await db.query("delete from public.payment_orders where user_id = $1", [profileA.id]);
  await db.query("update public.profiles set credits_balance = 0 where id = $1", [profileA.id]);

  const order = await createOrder({ profileId: profileA.id, credits: 50, providerOrderId: "inv-double" });

  await db.query("select public.fulfill_payment_order($1, 'paid', 'trx-1')", [order.id]);
  await db.query("select public.fulfill_payment_order($1, 'paid', 'trx-1')", [order.id]);

  assert.equal(await balance(profileA.id), 50, "kredit tidak boleh digandakan");
});

// ---------------------------------------------------------------------------
// 5. Hak akses RPC baru
// ---------------------------------------------------------------------------

test("klien tidak boleh memanggil RPC maintenance", async () => {
  for (const call of [
    "select public.expire_subscriptions()",
    "select public.expire_stale_payment_orders(1440)",
    "select public.orders_for_reconciliation(50, 7)",
  ]) {
    await assert.rejects(
      () => asUser(USER_A, call),
      `pengguna terautentikasi tidak boleh bisa memanggil: ${call}`,
    );
  }
});

test("langganan premium yang dibeli tetap aktif setelah sweep", async () => {
  await db.query("delete from public.payment_orders where user_id = $1", [profileB.id]);
  await db.query(
    "update public.profiles set credits_balance = 0, subscription_tier = 'free', subscription_expiry = null where id = $1",
    [profileB.id],
  );

  const order = await createOrder({
    profileId: profileB.id,
    orderType: "subscription",
    packageId: "premium-6m",
    credits: 1000,
    amount: 149000,
    durationMonths: 6,
    providerOrderId: "inv-sub",
  });

  await db.query("select public.fulfill_payment_order($1, 'paid', 'trx-sub')", [order.id]);
  await db.query("select public.expire_subscriptions()");

  const state = await profileState(profileB.id);
  assert.equal(state.subscription_tier, "premium", "langganan baru tidak boleh langsung diturunkan");
  assert.ok(new Date(state.subscription_expiry).getTime() > Date.now(), "masa berlaku harus di masa depan");
});
