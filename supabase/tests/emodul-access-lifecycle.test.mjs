// Verifikasi otomatisasi akses E-Book mengikuti langganan.
//
// Alur yang diuji:
// - pengguna free/premium kedaluwarsa tidak berhak; premium aktif berhak;
// - akses dicabut begitu masa berlaku lewat, bahkan sebelum sweep dijalankan;
// - `expire_subscriptions()` menurunkan premium kedaluwarsa (akses ikut tertutup);
// - aturan SQL dan helper TS harus sepakat (anti-drift).
//
// Jalankan: npm test

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const files = [
  join(root, "supabase", "tests", "harness.sql"),
  join(root, "supabase", "migrations", "20260515000000_initial_buat_soal_schema.sql"),
  join(root, "supabase", "migrations", "20260912000000_p0_security_hotfix.sql"),
  join(root, "supabase", "migrations", "20260912010000_p1_billing_lifecycle.sql"),
  join(root, "supabase", "migrations", "20260915090000_emodul_access_status.sql"),
];
const USER_A = "11111111-1111-4111-8111-111111111111";

const { resolveEbookEntitlement } = await import(
  pathToFileURL(join(root, "supabase", "functions", "_shared", "entitlement.ts")).href
);

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

let db;
let profileA;

async function asUser(userId, sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("set role authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

async function failure(fn) {
  try {
    await fn();
  } catch (error) {
    return String(error?.message ?? error);
  }
  throw new Error("Query seharusnya gagal.");
}

async function status(userId) {
  return (await db.query("select emodul_access_status($1) as result", [userId])).rows[0].result;
}

async function setSubscription(tier, expiry) {
  await db.query(
    "update profiles set subscription_tier = $2, subscription_expiry = $3 where id = $1",
    [profileA.id, tier, expiry],
  );
}

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')",
    [USER_A, "access@example.com"],
  );
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
});

beforeEach(async () => {
  await db.query(
    "update profiles set subscription_tier='free', subscription_expiry=null where id=$1",
    [profileA.id],
  );
});

after(async () => db.close());

test("pengguna free tidak berhak", async () => {
  const result = await status(profileA.id);

  assert.equal(result.entitled, false);
  assert.equal(result.tier, "free");
  assert.equal(result.expires_at, null);
});

test("premium tanpa tanggal berhak selamanya", async () => {
  await setSubscription("premium", null);

  const result = await status(profileA.id);

  assert.equal(result.entitled, true);
  assert.equal(result.tier, "premium");
});

test("premium aktif (masa depan) langsung berhak tanpa proses manual", async () => {
  await setSubscription("premium", "2999-01-01T00:00:00Z");

  const result = await status(profileA.id);

  assert.equal(result.entitled, true);
  assert.equal(new Date(result.expires_at).getTime(), Date.parse("2999-01-01T00:00:00Z"));
});

test("akses dicabut begitu masa berlaku lewat, sebelum sweep", async () => {
  await setSubscription("premium", "2000-01-01T00:00:00Z");

  const result = await status(profileA.id);

  assert.equal(result.entitled, false);
  assert.equal(result.tier, "premium");
});

test("expire_subscriptions menurunkan premium kedaluwarsa (akses tertutup)", async () => {
  await setSubscription("premium", "2000-01-01T00:00:00Z");

  await db.query("select expire_subscriptions()");

  const profile = (await db.query(
    "select subscription_tier, subscription_expiry from profiles where id=$1",
    [profileA.id],
  )).rows[0];
  const result = await status(profileA.id);

  assert.equal(profile.subscription_tier, "free");
  assert.equal(profile.subscription_expiry, null);
  assert.equal(result.entitled, false);
});

test("pengguna tak dikenal ditolak", async () => {
  assert.match(await failure(() => status(999999)), /not_found/);
});

test("aturan SQL dan helper TS sepakat", async () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const shapes = [
    { tier: "free", expiry: null },
    { tier: "premium", expiry: null },
    { tier: "premium", expiry: "2999-01-01T00:00:00Z" },
    { tier: "premium", expiry: "2000-01-01T00:00:00Z" },
  ];

  for (const shape of shapes) {
    await setSubscription(shape.tier, shape.expiry);

    const sql = await status(profileA.id);
    const ts = resolveEbookEntitlement(
      { subscription_tier: shape.tier, subscription_expiry: shape.expiry },
      now,
    );

    assert.equal(sql.entitled, ts.entitled, `entitled beda untuk ${JSON.stringify(shape)}`);
    assert.equal(sql.tier, ts.tier, `tier beda untuk ${JSON.stringify(shape)}`);
  }
});

test("klien tidak bisa memanggil status akses langsung", async () => {
  assert.match(
    await failure(() =>
      asUser(USER_A, "select emodul_access_status($1)", [profileA.id]),
    ),
    /permission denied|denied/i,
  );
});
