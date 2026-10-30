// Verifikasi skema e-modul: bab, subbab materi, dan latihan.
//
// Skema ini fondasi untuk generator/editor e-modul. Uji ini memastikan:
// - struktur tabel & constraint nomor urut/jenis tersimpan benar;
// - RLS hanya memperlihatkan modul milik pengguna aktif;
// - klien tidak bisa menulis langsung (semua mutasi lewat RPC);
// - updated_at bergerak otomatis dan hapus modul ikut menghapus turunannya.
//
// Jalankan: npm test

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const files = [
  join(root, "supabase", "tests", "harness.sql"),
  join(root, "supabase", "migrations", "20260515000000_initial_buat_soal_schema.sql"),
  join(root, "supabase", "migrations", "20260915000000_emodul_schema.sql"),
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
let modulB;
let babA;
let bagianMateriA;
let bagianLatihanA;

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

  for (const [id, email] of [[USER_A, "emodul-a@example.com"], [USER_B, "emodul-b@example.com"]]) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, email]);
  }
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
  profileB = (await db.query("select id from profiles where auth_user_id=$1", [USER_B])).rows[0];

  modulA = (await db.query(
    "insert into e_modul_sessions (user_id, title, topics, fase, kelas, subject) values ($1, 'Ekosistem', $2::jsonb, 'Fase D', 'Kelas 7', 'Ilmu Pengetahuan Alam') returning id",
    [profileA.id, JSON.stringify([{ topik: "Ekosistem", capaian: "Menjelaskan komponen ekosistem." }])],
  )).rows[0].id;
  modulB = (await db.query(
    "insert into e_modul_sessions (user_id, title) values ($1, 'Modul B') returning id",
    [profileB.id],
  )).rows[0].id;

  babA = (await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 1, 'Bab 1: Ekosistem') returning id",
    [modulA],
  )).rows[0].id;
  await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 1, 'Bab B')",
    [modulB],
  );

  bagianMateriA = (await db.query(
    "insert into e_modul_sections (chapter_id, order_number, kind, title, content) values ($1, 1, 'materi', 'Subbab 1.1', 'Uraian materi ekosistem.') returning id",
    [babA],
  )).rows[0].id;
  bagianLatihanA = (await db.query(
    "insert into e_modul_sections (chapter_id, order_number, kind, title, content) values ($1, 2, 'latihan', 'Latihan 1.2', 'Soal latihan ekosistem.') returning id",
    [babA],
  )).rows[0].id;
});

after(async () => db.close());

test("sesi e-modul menyimpan struktur dan default yang wajar", async () => {
  const row = (await db.query(
    "select title, chapters_target, sub_chapters_target, exercise_share, status, credits_consumed from e_modul_sessions where id=$1",
    [modulA],
  )).rows[0];

  assert.equal(row.title, "Ekosistem");
  assert.equal(Number(row.chapters_target), 4);
  assert.equal(Number(row.sub_chapters_target), 2);
  assert.equal(Number(row.exercise_share), 30);
  assert.equal(row.status, "draft");
  assert.equal(Number(row.credits_consumed), 0);
});

test("bab dan bagian tersimpan berurutan dengan jenis yang benar", async () => {
  const chapters = (await db.query(
    "select id, order_number, title from e_modul_chapters where e_modul_id=$1 order by order_number",
    [modulA],
  )).rows;
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, "Bab 1: Ekosistem");

  const sections = (await db.query(
    "select id, order_number, kind from e_modul_sections where chapter_id=$1 order by order_number",
    [babA],
  )).rows;
  assert.deepEqual(
    sections.map((section) => [Number(section.order_number), section.kind]),
    [[1, "materi"], [2, "latihan"]],
  );
});

test("nomor urut bab unik per e-modul", async () => {
  assert.match(
    await failure(() =>
      db.query(
        "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 1, 'Duplikat')",
        [modulA],
      ),
    ),
    /unique|duplicate/i,
  );
});

test("jenis bagian di luar materi/latihan ditolak", async () => {
  assert.match(
    await failure(() =>
      db.query(
        "insert into e_modul_sections (chapter_id, order_number, kind) values ($1, 3, 'lainnya')",
        [babA],
      ),
    ),
    /check|constraint/i,
  );
});

test("porsi latihan di luar 0..60 ditolak", async () => {
  assert.match(
    await failure(() =>
      db.query("update e_modul_sessions set exercise_share=100 where id=$1", [modulA]),
    ),
    /check|constraint/i,
  );
});

test("RLS hanya memperlihatkan modul milik pengguna aktif", async () => {
  const own = (await asUser(USER_A, "select id from e_modul_sessions order by id")).rows;
  assert.deepEqual(own.map((row) => Number(row.id)), [Number(modulA)]);

  const other = (await asUser(USER_B, "select id from e_modul_sessions order by id")).rows;
  assert.deepEqual(other.map((row) => Number(row.id)), [Number(modulB)]);
});

test("bab & bagian milik pengguna lain tidak terlihat", async () => {
  const bab = (await asUser(USER_B, "select id from e_modul_chapters where id=$1", [babA])).rows;
  assert.equal(bab.length, 0);

  const bagian = (await asUser(USER_B, "select id from e_modul_sections where id=$1", [bagianMateriA])).rows;
  assert.equal(bagian.length, 0);
});

test("klien tidak bisa menulis langsung (harus lewat RPC)", async () => {
  assert.match(
    await failure(() =>
      asUser(USER_A, "insert into e_modul_sessions (user_id, title) values ($1, 'Curang')", [profileA.id]),
    ),
    /permission denied|denied/i,
  );
  assert.match(
    await failure(() =>
      asUser(USER_A, "update e_modul_sections set content='Diubah langsung' where id=$1", [bagianMateriA]),
    ),
    /permission denied|denied/i,
  );
});

test("updated_at bergerak saat baris diubah", async () => {
  await db.query("update e_modul_sessions set updated_at='2000-01-01T00:00:00Z' where id=$1", [modulA]);
  await db.query("update e_modul_sessions set title='Ekosistem (revisi)' where id=$1", [modulA]);

  const row = (await db.query("select updated_at from e_modul_sessions where id=$1", [modulA])).rows[0];
  assert.ok(new Date(row.updated_at).getFullYear() > 2000);
});

test("menghapus e-modul ikut menghapus bab dan bagiannya", async () => {
  await db.query("delete from e_modul_sessions where id=$1", [modulA]);

  const chapters = (await db.query(
    "select count(*)::int as n from e_modul_chapters where e_modul_id=$1",
    [modulA],
  )).rows[0].n;
  const sections = (await db.query(
    "select count(*)::int as n from e_modul_sections where id = any($1::bigint[])",
    [[bagianMateriA, bagianLatihanA]],
  )).rows[0].n;

  assert.equal(chapters, 0);
  assert.equal(sections, 0);
});
