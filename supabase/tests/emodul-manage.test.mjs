// Verifikasi kelola struktur e-modul: susun ulang, tambah, hapus bab/bagian.
//
// Penyusunan ulang harus menulis nomor rapat 1..N tanpa bentrok unique, batas
// minimal (satu bab / satu bagian) dijaga, kepemilikan diverifikasi, dan klien
// tidak bisa memanggil RPC-nya langsung.
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
  join(root, "supabase", "migrations", "20260915050000_emodul_structure_manage.sql"),
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
let bab1;
let bab2;
let s1;
let s2;

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

async function rpc(sql, params) {
  return db.query(sql, params);
}

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  for (const [id, email] of [[USER_A, "manage-a@example.com"], [USER_B, "manage-b@example.com"]]) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, email]);
  }
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
  profileB = (await db.query("select id from profiles where auth_user_id=$1", [USER_B])).rows[0];
});

beforeEach(async () => {
  await db.query("delete from e_modul_sessions");

  modulA = (await db.query(
    "insert into e_modul_sessions (user_id, title) values ($1, 'Ekosistem') returning id",
    [profileA.id],
  )).rows[0].id;
  bab1 = (await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 1, 'Bab 1') returning id",
    [modulA],
  )).rows[0].id;
  bab2 = (await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 2, 'Bab 2') returning id",
    [modulA],
  )).rows[0].id;
  s1 = (await db.query(
    "insert into e_modul_sections (chapter_id, order_number, kind, title, content) values ($1, 1, 'materi', 'Subbab 1.1', 'Isi 1') returning id",
    [bab1],
  )).rows[0].id;
  s2 = (await db.query(
    "insert into e_modul_sections (chapter_id, order_number, kind, title, content) values ($1, 2, 'latihan', 'Latihan 1.2', 'Isi 2') returning id",
    [bab1],
  )).rows[0].id;

  modulB = (await db.query(
    "insert into e_modul_sessions (user_id, title) values ($1, 'Modul B') returning id",
    [profileB.id],
  )).rows[0].id;
  await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 1, 'Bab B')",
    [modulB],
  );
});

after(async () => db.close());

test("menyusun ulang bab menulis nomor rapat sesuai urutan id", async () => {
  const result = (await rpc(
    "select reorder_emodul_chapters($1, $2, $3::bigint[]) as result",
    [profileA.id, modulA, [bab2, bab1]],
  )).rows[0].result;

  assert.deepEqual(
    result.chapters.map((chapter) => [Number(chapter.order_number), chapter.title]),
    [[1, "Bab 2"], [2, "Bab 1"]],
  );

  const rows = (await db.query(
    "select id, order_number from e_modul_chapters where e_modul_id=$1 order by order_number",
    [modulA],
  )).rows;
  assert.deepEqual(rows.map((row) => [Number(row.id), Number(row.order_number)]), [[Number(bab2), 1], [Number(bab1), 2]]);
});

test("daftar urutan bab yang tidak lengkap/ganda ditolak", async () => {
  assert.match(
    await failure(() =>
      rpc("select reorder_emodul_chapters($1, $2, $3::bigint[])", [profileA.id, modulA, [bab1]]),
    ),
    /invalid_order/,
  );
  assert.match(
    await failure(() =>
      rpc("select reorder_emodul_chapters($1, $2, $3::bigint[])", [profileA.id, modulA, [bab1, bab1]]),
    ),
    /invalid_order/,
  );
});

test("menyusun ulang bagian di dalam bab", async () => {
  const result = (await rpc(
    "select reorder_emodul_sections($1, $2, $3::bigint[]) as result",
    [profileA.id, bab1, [s2, s1]],
  )).rows[0].result;

  const chapter = result.chapters.find((item) => Number(item.id) === Number(bab1));
  assert.deepEqual(
    chapter.sections.map((section) => [Number(section.order_number), Number(section.id)]),
    [[1, Number(s2)], [2, Number(s1)]],
  );
});

test("tambah bagian di akhir bab", async () => {
  const result = (await rpc(
    "select add_emodul_section($1, $2, 'latihan', 'Latihan Baru', 'Isi latihan') as result",
    [profileA.id, bab1],
  )).rows[0].result;

  const chapter = result.chapters.find((item) => Number(item.id) === Number(bab1));
  assert.equal(chapter.sections.length, 3);
  assert.equal(chapter.sections[2].kind, "latihan");
  assert.equal(chapter.sections[2].title, "Latihan Baru");
  assert.equal(Number(chapter.sections[2].order_number), 3);
});

test("jenis bagian selain materi/latihan ditolak", async () => {
  assert.match(
    await failure(() =>
      rpc("select add_emodul_section($1, $2, 'lainnya', 'X', 'Y')", [profileA.id, bab1]),
    ),
    /invalid_kind/,
  );
});

test("hapus bagian lalu rapatkan nomor urut", async () => {
  const result = (await rpc(
    "select delete_emodul_section($1, $2) as result",
    [profileA.id, s1],
  )).rows[0].result;

  const chapter = result.chapters.find((item) => Number(item.id) === Number(bab1));
  assert.equal(chapter.sections.length, 1);
  assert.equal(Number(chapter.sections[0].id), Number(s2));
  assert.equal(Number(chapter.sections[0].order_number), 1);
});

test("bagian terakhir tidak boleh dihapus", async () => {
  await rpc("select delete_emodul_section($1, $2)", [profileA.id, s1]);

  assert.match(
    await failure(() => rpc("select delete_emodul_section($1, $2)", [profileA.id, s2])),
    /last_section/,
  );
});

test("tambah bab di akhir e-modul", async () => {
  const result = (await rpc(
    "select add_emodul_chapter($1, $2, 'Bab 3') as result",
    [profileA.id, modulA],
  )).rows[0].result;

  assert.equal(result.chapters.length, 3);
  assert.equal(result.chapters[2].title, "Bab 3");
  assert.equal(Number(result.chapters[2].order_number), 3);
});

test("hapus bab merapikan nomor dan membuang bagiannya (cascade)", async () => {
  const result = (await rpc(
    "select delete_emodul_chapter($1, $2) as result",
    [profileA.id, bab1],
  )).rows[0].result;

  assert.equal(result.chapters.length, 1);
  assert.equal(Number(result.chapters[0].id), Number(bab2));
  assert.equal(Number(result.chapters[0].order_number), 1);

  const sections = (await db.query(
    "select count(*)::int as n from e_modul_sections where id = any($1::bigint[])",
    [[s1, s2]],
  )).rows[0].n;
  assert.equal(sections, 0);
});

test("bab terakhir tidak boleh dihapus", async () => {
  await rpc("select delete_emodul_chapter($1, $2)", [profileA.id, bab1]);

  assert.match(
    await failure(() => rpc("select delete_emodul_chapter($1, $2)", [profileA.id, bab2])),
    /last_chapter/,
  );
});

test("tidak bisa mengelola draf milik pengguna lain", async () => {
  assert.match(
    await failure(() =>
      rpc("select reorder_emodul_chapters($1, $2, $3::bigint[])", [profileB.id, modulA, [bab2, bab1]]),
    ),
    /forbidden/,
  );
  assert.match(
    await failure(() =>
      rpc("select add_emodul_section($1, $2, 'materi', 'X', 'Y')", [profileB.id, bab1]),
    ),
    /forbidden/,
  );
  assert.match(
    await failure(() => rpc("select delete_emodul_section($1, $2)", [profileB.id, s1])),
    /not_found/,
  );
});

test("klien tidak bisa memanggil RPC kelola langsung", async () => {
  assert.match(
    await failure(() =>
      asUser(USER_A, "select add_emodul_chapter($1, $2, 'X')", [profileA.id, modulA]),
    ),
    /permission denied|denied/i,
  );
});
