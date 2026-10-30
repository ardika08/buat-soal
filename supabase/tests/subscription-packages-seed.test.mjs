// Verifikasi seed paket langganan + manfaat E-Book.
//
// Seed harus:
// - mengisi paket premium dengan harga/kredit/durasi sesuai definisi kode;
// - menyertakan manfaat E-Book yang sama dengan `EBOOK_BENEFITS`;
// - idempoten (dijalankan ulang tidak membuat duplikat).
//
// Jalankan: npm test

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const seedFile = join(root, "supabase", "migrations", "20260915110000_subscription_packages_seed.sql");
const files = [
  join(root, "supabase", "tests", "harness.sql"),
  join(root, "supabase", "migrations", "20260515000000_initial_buat_soal_schema.sql"),
  join(root, "supabase", "migrations", "20260915100000_subscription_packages.sql"),
  seedFile,
];

const functionsDir = join(root, "supabase", "functions", "_shared");
const { billingPackages } = await import(pathToFileURL(join(functionsDir, "billing.ts")).href);
const { EBOOK_BENEFITS } = await import(pathToFileURL(join(functionsDir, "ebook-plans.ts")).href);

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

let db;

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));
});

after(async () => db.close());

test("paket premium ter-seed sesuai definisi kode", async () => {
  const rows = (await db.query(
    "select id, name, price, credits, duration_months, tier, ebook_included from subscription_packages order by sort_order",
  )).rows;

  assert.deepEqual(
    rows.map((row) => row.id),
    Object.keys(billingPackages),
  );

  for (const row of rows) {
    const server = billingPackages[row.id];

    assert.ok(server, `paket ${row.id} tidak ada di definisi kode`);
    assert.equal(row.name, server.name);
    assert.equal(Number(row.price), server.price);
    assert.equal(Number(row.credits), server.credits);
    assert.equal(Number(row.duration_months), server.duration_months);
    assert.equal(row.tier, "premium");
    assert.equal(row.ebook_included, true);
  }
});

test("manfaat E-Book ter-seed sama dengan definisi kode", async () => {
  const rows = (await db.query("select ebook_benefits from subscription_packages")).rows;

  for (const row of rows) {
    assert.deepEqual(row.ebook_benefits, EBOOK_BENEFITS);
  }
});

test("seed idempoten saat dijalankan ulang", async () => {
  await db.exec(prepareSql(readFileSync(seedFile, "utf8")));

  const count = (await db.query("select count(*)::int as n from subscription_packages")).rows[0].n;
  assert.equal(count, 2);
});
