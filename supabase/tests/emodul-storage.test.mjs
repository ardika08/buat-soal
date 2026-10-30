// Verifikasi penyempurnaan penyimpanan e-modul untuk editor.
//
// Fokus uji: index "draf terakhir" tersedia, dan updated_at draf induk bergerak
// setiap kali bab/bagian ditulis (insert/update) tanpa mengganggu draf lain.
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
  join(root, "supabase", "migrations", "20260915060000_emodul_storage_refine.sql"),
];
const USER_A = "11111111-1111-4111-8111-111111111111";

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

let db;
let profileA;
let modulA;
let modulB;
let babA;
let bagianA;

function yearOf(value) {
  return new Date(value).getFullYear();
}

/**
 * Mundurkan updated_at untuk keperluan uji. Trigger set_updated_at menimpa nilai
 * pada UPDATE biasa, jadi trigger dinonaktifkan sesaat (tes berjalan sebagai owner).
 */
async function backdate(ids, value = "2000-01-01T00:00:00Z") {
  await db.exec("alter table e_modul_sessions disable trigger e_modul_sessions_set_updated_at");
  try {
    for (const id of ids) {
      await db.query("update e_modul_sessions set updated_at=$2 where id=$1", [id, value]);
    }
  } finally {
    await db.exec("alter table e_modul_sessions enable trigger e_modul_sessions_set_updated_at");
  }
}

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')",
    [USER_A, "storage@example.com"],
  );
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
});

beforeEach(async () => {
  await db.query("delete from e_modul_sessions");

  modulA = (await db.query(
    "insert into e_modul_sessions (user_id, title) values ($1, 'Ekosistem') returning id",
    [profileA.id],
  )).rows[0].id;
  modulB = (await db.query(
    "insert into e_modul_sessions (user_id, title) values ($1, 'Modul B') returning id",
    [profileA.id],
  )).rows[0].id;
  babA = (await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 1, 'Bab 1') returning id",
    [modulA],
  )).rows[0].id;
  bagianA = (await db.query(
    "insert into e_modul_sections (chapter_id, order_number, kind, title, content) values ($1, 1, 'materi', 'Subbab 1.1', 'Isi') returning id",
    [babA],
  )).rows[0].id;
});

after(async () => db.close());

test("index daftar draf terakhir tersedia", async () => {
  const row = (await db.query(
    "select count(*)::int as n from pg_indexes where tablename='e_modul_sessions' and indexname='e_modul_sessions_user_updated_idx'",
  )).rows[0];

  assert.equal(row.n, 1);
});

test("menulis bagian menyentuh updated_at draf induk saja", async () => {
  await backdate([modulA, modulB]);

  await db.query("update e_modul_sections set content='Isi baru' where id=$1", [bagianA]);

  const rows = (await db.query(
    "select id, updated_at from e_modul_sessions where id = any($1::bigint[]) order by id",
    [[modulA, modulB]],
  )).rows;
  const byId = new Map(rows.map((row) => [Number(row.id), row.updated_at]));

  assert.ok(yearOf(byId.get(Number(modulA))) > 2000);
  assert.equal(yearOf(byId.get(Number(modulB))), 2000);
});

test("menambah bab menyentuh updated_at draf induk", async () => {
  await backdate([modulA]);

  await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 2, 'Bab 2')",
    [modulA],
  );

  const row = (await db.query("select updated_at from e_modul_sessions where id=$1", [modulA])).rows[0];
  assert.ok(yearOf(row.updated_at) > 2000);
});

test("mengubah judul bab menyentuh updated_at draf induk", async () => {
  await backdate([modulA]);

  await db.query("update e_modul_chapters set title='Bab 1 Baru' where id=$1", [babA]);

  const row = (await db.query("select updated_at from e_modul_sessions where id=$1", [modulA])).rows[0];
  assert.ok(yearOf(row.updated_at) > 2000);
});
