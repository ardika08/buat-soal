// Verifikasi niat upgrade E-Book: validasi murni + RPC simpan/ambil/resume/batal.
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
  join(root, "supabase", "migrations", "20260915080000_emodul_upgrade_intent.sql"),
];
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const { normalizeUpgradeIntent, isSafeReturnPath } = await import(
  pathToFileURL(join(root, "supabase", "functions", "_shared", "emodul-intent.ts")).href
);

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

let db;
let profileA;
let profileB;

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

async function saveIntent(userId, returnTo, action) {
  return db.query(
    "select save_emodul_upgrade_intent($1, $2, $3) as result",
    [userId, returnTo, action],
  );
}

async function getIntent(userId) {
  return db.query("select get_emodul_upgrade_intent($1) as result", [userId]);
}

async function resumeIntent(userId) {
  return db.query("select resume_emodul_upgrade_intent($1) as result", [userId]);
}

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  for (const [id, email] of [[USER_A, "intent-a@example.com"], [USER_B, "intent-b@example.com"]]) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, email]);
  }
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
  profileB = (await db.query("select id from profiles where auth_user_id=$1", [USER_B])).rows[0];
});

beforeEach(async () => {
  await db.query("delete from emodul_upgrade_intents");
});

after(async () => db.close());

// --- Validasi murni ---

test("path internal aman diterima, path luar ditolak", () => {
  assert.equal(isSafeReturnPath("/e-modul/draf-1/pratinjau"), true);
  assert.equal(isSafeReturnPath("/e-modul/draf-1/pratinjau?x=1"), true);
  assert.equal(isSafeReturnPath("//evil.example"), false);
  assert.equal(isSafeReturnPath("https://evil.example"), false);
  assert.equal(isSafeReturnPath("e-modul"), false);
  assert.equal(isSafeReturnPath(""), false);
});

test("normalisasi niat menolak aksi tak dikenal", () => {
  assert.deepEqual(
    normalizeUpgradeIntent({ return_to: "/e-modul/x/pratinjau", action: "download_pdf" }),
    { return_to: "/e-modul/x/pratinjau", action: "download_pdf" },
  );
  assert.equal(
    normalizeUpgradeIntent({ return_to: "/e-modul/x/pratinjau", action: "hapus" }),
    null,
  );
  assert.equal(
    normalizeUpgradeIntent({ return_to: "https://evil.example", action: "download_pdf" }),
    null,
  );
});

// --- RPC ---

test("menyimpan niat lalu mengambilnya kembali", async () => {
  await saveIntent(profileA.id, "/e-modul/draf-1/pratinjau", "download_pdf");

  const intent = (await getIntent(profileA.id)).rows[0].result;

  assert.equal(intent.return_to, "/e-modul/draf-1/pratinjau");
  assert.equal(intent.action, "download_pdf");
  assert.equal(intent.status, "pending");
});

test("menyimpan lagi membatalkan niat pending lama", async () => {
  await saveIntent(profileA.id, "/e-modul/draf-1/pratinjau", "download_pdf");
  await saveIntent(profileA.id, "/e-modul/draf-2/pratinjau", "download_docx");

  const pending = (await getIntent(profileA.id)).rows[0].result;
  const cancelled = (await db.query(
    "select count(*)::int as n from emodul_upgrade_intents where user_id=$1 and status='cancelled'",
    [profileA.id],
  )).rows[0].n;

  assert.equal(pending.return_to, "/e-modul/draf-2/pratinjau");
  assert.equal(cancelled, 1);
});

test("resume menandai niat dan berikutnya tidak ada pending", async () => {
  await saveIntent(profileA.id, "/e-modul/draf-1/pratinjau", "download_pdf");

  const resumed = (await resumeIntent(profileA.id)).rows[0].result;
  assert.equal(resumed.status, "resumed");
  assert.equal(resumed.action, "download_pdf");

  assert.equal((await getIntent(profileA.id)).rows[0].result, null);
});

test("batalkan menghapus semua niat pending", async () => {
  await saveIntent(profileA.id, "/e-modul/draf-1/pratinjau", "download_pdf");

  const cancelled = (await db.query(
    "select cancel_emodul_upgrade_intent($1) as result",
    [profileA.id],
  )).rows[0].result;

  assert.equal(Number(cancelled), 1);
  assert.equal((await getIntent(profileA.id)).rows[0].result, null);
});

test("niat antar pengguna terpisah", async () => {
  await saveIntent(profileA.id, "/e-modul/a/pratinjau", "download_pdf");
  await saveIntent(profileB.id, "/e-modul/b/pratinjau", "download_docx");

  assert.equal((await getIntent(profileA.id)).rows[0].result.return_to, "/e-modul/a/pratinjau");
  assert.equal((await getIntent(profileB.id)).rows[0].result.action, "download_docx");
});

test("return_to luar/aksi tak dikenal ditolak di server", async () => {
  assert.match(
    await failure(() => saveIntent(profileA.id, "https://evil.example", "download_pdf")),
    /invalid_return_to/,
  );
  assert.match(
    await failure(() => saveIntent(profileA.id, "/e-modul/x", "hapus")),
    /invalid_action/,
  );
});

test("RLS baca milik sendiri & klien tak bisa memanggil RPC", async () => {
  await saveIntent(profileA.id, "/e-modul/a/pratinjau", "download_pdf");
  await saveIntent(profileB.id, "/e-modul/b/pratinjau", "download_docx");

  const own = (await asUser(USER_A, "select return_to from emodul_upgrade_intents where status='pending'")).rows;
  assert.deepEqual(own.map((row) => row.return_to), ["/e-modul/a/pratinjau"]);

  assert.match(
    await failure(() =>
      asUser(USER_A, "select save_emodul_upgrade_intent($1, '/x', 'download_pdf')", [profileA.id]),
    ),
    /permission denied|denied/i,
  );
});
