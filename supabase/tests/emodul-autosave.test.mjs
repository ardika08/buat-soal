// Verifikasi simpan otomatis satu bagian e-modul.
//
// Autosave hanya boleh menyentuh bagian milik pengguna, memperbarui field yang
// dikirim saja, menyentuh updated_at draf induk, dan tidak bisa dipanggil klien.
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
  join(root, "supabase", "migrations", "20260915000000_emodul_schema.sql"),
  join(root, "supabase", "migrations", "20260915040000_emodul_autosave_function.sql"),
];
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

let db;
let profileA;
let profileB;
let modulA;
let bagianA;
let bagianB;

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

async function autosave(userId, sectionId, title, content) {
  return db.query(
    "select autosave_emodul_section($1, $2, $3, $4) as result",
    [userId, sectionId, title, content],
  );
}

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  for (const [id, email] of [[USER_A, "autosave-a@example.com"], [USER_B, "autosave-b@example.com"]]) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, email]);
  }
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
  profileB = (await db.query("select id from profiles where auth_user_id=$1", [USER_B])).rows[0];
});

beforeEach(async () => {
  await db.query("delete from e_modul_sessions");

  modulA = (await db.query(
    "insert into e_modul_sessions (user_id, title, updated_at) values ($1, 'Ekosistem', '2000-01-01T00:00:00Z') returning id",
    [profileA.id],
  )).rows[0].id;
  const babA = (await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 1, 'Bab 1') returning id",
    [modulA],
  )).rows[0].id;
  bagianA = (await db.query(
    "insert into e_modul_sections (chapter_id, order_number, kind, title, content) values ($1, 1, 'materi', 'Subbab 1.1', 'Isi lama') returning id",
    [babA],
  )).rows[0].id;

  const modulB = (await db.query(
    "insert into e_modul_sessions (user_id, title) values ($1, 'Modul B') returning id",
    [profileB.id],
  )).rows[0].id;
  const babB = (await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 1, 'Bab B') returning id",
    [modulB],
  )).rows[0].id;
  bagianB = (await db.query(
    "insert into e_modul_sections (chapter_id, order_number, kind, title, content) values ($1, 1, 'materi', 'Subbab B', 'Isi B') returning id",
    [babB],
  )).rows[0].id;
});

after(async () => db.close());

test("menyimpan judul dan isi bagian milik pengguna", async () => {
  const saved = (await autosave(profileA.id, bagianA, "Subbab Baru", "Isi baru")).rows[0].result;

  assert.equal(saved.section_id, bagianA);
  assert.equal(saved.title, "Subbab Baru");
  assert.equal(saved.content, "Isi baru");
  assert.equal(saved.kind, "materi");

  const row = (await db.query("select title, content from e_modul_sections where id=$1", [bagianA])).rows[0];
  assert.equal(row.title, "Subbab Baru");
  assert.equal(row.content, "Isi baru");
});

test("field yang tidak dikirim dibiarkan apa adanya", async () => {
  const saved = (await autosave(profileA.id, bagianA, null, "Hanya isi yang berubah")).rows[0].result;

  assert.equal(saved.title, "Subbab 1.1");
  assert.equal(saved.content, "Hanya isi yang berubah");
});

test("updated_at draf induk ikut bergerak", async () => {
  await autosave(profileA.id, bagianA, null, "Isi baru");

  const row = (await db.query("select updated_at from e_modul_sessions where id=$1", [modulA])).rows[0];
  assert.ok(new Date(row.updated_at).getFullYear() > 2000);
});

test("tidak bisa menyimpan bagian milik pengguna lain", async () => {
  assert.match(
    await failure(() => autosave(profileA.id, bagianB, "Curang", "Curang")),
    /not_found/,
  );

  const row = (await db.query("select title from e_modul_sections where id=$1", [bagianB])).rows[0];
  assert.equal(row.title, "Subbab B");
});

test("id bagian tak dikenal ditolak", async () => {
  assert.match(await failure(() => autosave(profileA.id, 999999, "X", "Y")), /not_found/);
});

test("klien tidak bisa memanggil autosave langsung", async () => {
  assert.match(
    await failure(() =>
      asUser(USER_A, "select autosave_emodul_section($1, $2, 'X', 'Y')", [profileA.id, bagianA]),
    ),
    /permission denied|denied/i,
  );
});
