// Verifikasi skema katalog paket langganan + fitur E-Book.
//
// Jalankan: npm test

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const files = [
  join(root, "supabase", "tests", "harness.sql"),
  join(root, "supabase", "migrations", "20260515000000_initial_buat_soal_schema.sql"),
  join(root, "supabase", "migrations", "20260915100000_subscription_packages.sql"),
];
const USER_A = "11111111-1111-4111-8111-111111111111";

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

let db;

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

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')",
    [USER_A, "packages@example.com"],
  );
});

beforeEach(async () => {
  await db.query("delete from subscription_packages");
});

after(async () => db.close());

test("menyimpan paket dengan fitur E-Book dan default yang wajar", async () => {
  await db.query(
    "insert into subscription_packages (id, name, price, credits, duration_months, ebook_included, ebook_benefits) values ($1, $2, $3, $4, $5, $6, $7::jsonb)",
    ["premium-6m", "Premium 6 Bulan", 149000, 1000, 6, true, JSON.stringify([{ key: "unduh_pdf", label: "Unduh PDF" }])],
  );

  const row = (await db.query(
    "select tier, ebook_included, ebook_benefits, is_active, sort_order from subscription_packages where id=$1",
    ["premium-6m"],
  )).rows[0];

  assert.equal(row.tier, "premium");
  assert.equal(row.ebook_included, true);
  assert.deepEqual(row.ebook_benefits, [{ key: "unduh_pdf", label: "Unduh PDF" }]);
  assert.equal(row.is_active, true);
  assert.equal(Number(row.sort_order), 0);
});

test("id paket unik", async () => {
  await db.query("insert into subscription_packages (id, name, price) values ('p', 'P', 1000)");

  assert.match(
    await failure(() => db.query("insert into subscription_packages (id, name, price) values ('p', 'P2', 2000)")),
    /unique|duplicate/i,
  );
});

test("tier, harga, dan durasi divalidasi", async () => {
  assert.match(
    await failure(() =>
      db.query("insert into subscription_packages (id, name, price, tier) values ('x', 'X', 1000, 'gold')"),
    ),
    /check|constraint/i,
  );
  assert.match(
    await failure(() =>
      db.query("insert into subscription_packages (id, name, price) values ('y', 'Y', -1)"),
    ),
    /check|constraint/i,
  );
  assert.match(
    await failure(() =>
      db.query("insert into subscription_packages (id, name, price, duration_months) values ('z', 'Z', 1000, 0)"),
    ),
    /check|constraint/i,
  );
});

test("klien hanya melihat paket aktif", async () => {
  await db.query("insert into subscription_packages (id, name, price, is_active) values ('aktif', 'Aktif', 1000, true)");
  await db.query("insert into subscription_packages (id, name, price, is_active) values ('nonaktif', 'Nonaktif', 1000, false)");

  const rows = (await asUser(USER_A, "select id from subscription_packages order by id")).rows;

  assert.deepEqual(rows.map((row) => row.id), ["aktif"]);
});

test("klien tidak bisa menulis katalog", async () => {
  assert.match(
    await failure(() =>
      asUser(USER_A, "insert into subscription_packages (id, name, price) values ('x', 'X', 1000)"),
    ),
    /permission denied|denied/i,
  );
});
