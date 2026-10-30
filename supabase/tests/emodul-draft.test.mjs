// Verifikasi penyimpanan draf e-modul untuk editor (save_emodul_draft).
//
// Endpoint simpan hanya boleh memperbarui draf milik pengguna: metadata sesi,
// judul bab, serta judul & isi bagian. Id asing diabaikan (tidak membuat baris
// baru), dan klien tidak bisa memanggil RPC-nya langsung.
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
  join(root, "supabase", "migrations", "20260915030000_emodul_draft_function.sql"),
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
let bagianA;

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

async function saveDraft(userId, eModulId, payload, chapters) {
  return db.query(
    "select save_emodul_draft($1, $2, $3::jsonb, $4::jsonb) as result",
    [userId, eModulId, JSON.stringify(payload), JSON.stringify(chapters)],
  );
}

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')",
    [USER_A, "draft-a@example.com"],
  );
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')",
    [USER_B, "draft-b@example.com"],
  );
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
  profileB = (await db.query("select id from profiles where auth_user_id=$1", [USER_B])).rows[0];
});

beforeEach(async () => {
  await db.query("delete from e_modul_sessions");

  modulA = (await db.query(
    "insert into e_modul_sessions (user_id, title, subject) values ($1, 'Ekosistem', 'IPA') returning id",
    [profileA.id],
  )).rows[0].id;
  modulB = (await db.query(
    "insert into e_modul_sessions (user_id, title) values ($1, 'Modul B') returning id",
    [profileB.id],
  )).rows[0].id;

  babA = (await db.query(
    "insert into e_modul_chapters (e_modul_id, order_number, title) values ($1, 1, 'Bab 1: Ekosistem') returning id",
    [modulA],
  )).rows[0].id;
  bagianA = (await db.query(
    "insert into e_modul_sections (chapter_id, order_number, kind, title, content) values ($1, 1, 'materi', 'Subbab 1.1', 'Isi lama') returning id",
    [babA],
  )).rows[0].id;
});

after(async () => db.close());

test("menyimpan draf memperbarui metadata, judul bab, dan isi bagian", async () => {
  const result = (await saveDraft(
    profileA.id,
    modulA,
    { title: "Ekosistem (revisi)", subject: "Ilmu Pengetahuan Alam", status: "ready" },
    [
      {
        id: babA,
        title: "Bab 1: Ekosistem Baru",
        sections: [{ id: bagianA, title: "Subbab Baru", content: "Isi baru yang diperbarui." }],
      },
    ],
  )).rows[0].result;

  assert.equal(result.e_modul.title, "Ekosistem (revisi)");
  assert.equal(result.e_modul.subject, "Ilmu Pengetahuan Alam");
  assert.equal(result.e_modul.status, "ready");
  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].title, "Bab 1: Ekosistem Baru");
  assert.equal(result.chapters[0].sections[0].title, "Subbab Baru");
  assert.equal(result.chapters[0].sections[0].content, "Isi baru yang diperbarui.");
});

test("tidak bisa menyimpan draf milik pengguna lain", async () => {
  assert.match(
    await failure(() => saveDraft(profileB.id, modulA, { title: "Curang" }, [])),
    /forbidden/,
  );

  const row = (await db.query("select title from e_modul_sessions where id=$1", [modulA])).rows[0];
  assert.equal(row.title, "Ekosistem");
});

test("id bab/bagian asing diabaikan (tidak membuat baris baru)", async () => {
  const result = (await saveDraft(profileA.id, modulA, {}, [
    { id: 999999, title: "Bab Hantu", sections: [{ id: 888888, title: "Hantu", content: "X" }] },
    { id: 777777, title: "Tanpa bagian" },
  ])).rows[0].result;

  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].title, "Bab 1: Ekosistem");

  const chapters = (await db.query(
    "select count(*)::int as n from e_modul_chapters where e_modul_id=$1",
    [modulA],
  )).rows[0].n;
  assert.equal(chapters, 1);
});

test("klien tidak bisa memanggil save_emodul_draft langsung", async () => {
  assert.match(
    await failure(() =>
      asUser(USER_A, "select save_emodul_draft($1, $2, '{}'::jsonb, '[]'::jsonb)", [profileA.id, modulA]),
    ),
    /permission denied|denied/i,
  );
});
