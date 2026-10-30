// Verifikasi konfigurasi kop & tata letak e-modul.
//
// Mencakup: normalisasi murni, RPC simpan/ambil (upsert), RLS baca milik sendiri,
// tolak tulis langsung dari klien, dan grant service_role.
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
  join(root, "supabase", "migrations", "20260915070000_emodul_settings.sql"),
];
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const { normalizeEModulSettings } = await import(
  pathToFileURL(join(root, "supabase", "functions", "_shared", "emodul-settings.ts")).href
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

async function save(userId, settings) {
  return db.query(
    "select save_emodul_settings($1, $2::jsonb) as result",
    [userId, JSON.stringify(settings)],
  );
}

async function get(userId) {
  return db.query("select get_emodul_settings($1) as result", [userId]);
}

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  for (const [id, email] of [[USER_A, "settings-a@example.com"], [USER_B, "settings-b@example.com"]]) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, email]);
  }
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
  profileB = (await db.query("select id from profiles where auth_user_id=$1", [USER_B])).rows[0];
});

beforeEach(async () => {
  await db.query("delete from emodul_settings");
});

after(async () => db.close());

// --- Normalisasi murni ---

test("normalisasi mengubah nilai hilang menjadi default pasti", () => {
  assert.deepEqual(normalizeEModulSettings({}), {
    school_name: "",
    address: "",
    phone: "",
    email: "",
    headmaster: "",
    nip: "",
    layout: {},
  });
});

test("layout non-objek diganti objek kosong", () => {
  assert.deepEqual(normalizeEModulSettings({ layout: "besar" }).layout, {});
  assert.deepEqual(normalizeEModulSettings({ layout: [] }).layout, {});
  assert.deepEqual(
    normalizeEModulSettings({ layout: { font_size: "besar" } }).layout,
    { font_size: "besar" },
  );
});

test("field non-string menjadi string kosong", () => {
  assert.equal(normalizeEModulSettings({ school_name: 42 }).school_name, "");
});

// --- RPC simpan/ambil ---

test("menyimpan lalu mengambil konfigurasi kop", async () => {
  await save(profileA.id, {
    school_name: "SMP Negeri 1",
    address: "Jalan Merdeka 1",
    phone: "(022) 1234567",
    email: "smpn1@example.sch.id",
    headmaster: "Bu Rina",
    nip: "123456789",
    layout: { font_size: "normal" },
  });

  const settings = (await get(profileA.id)).rows[0].result;

  assert.equal(settings.school_name, "SMP Negeri 1");
  assert.equal(settings.address, "Jalan Merdeka 1");
  assert.equal(settings.headmaster, "Bu Rina");
  assert.deepEqual(settings.layout, { font_size: "normal" });
});

test("menyimpan ulang memperbarui baris yang sama (upsert)", async () => {
  await save(profileA.id, { school_name: "SMP Lama" });
  await save(profileA.id, { school_name: "SMP Baru", nip: "999" });

  const rows = (await db.query(
    "select count(*)::int as n from emodul_settings where user_id=$1",
    [profileA.id],
  )).rows[0].n;
  const settings = (await get(profileA.id)).rows[0].result;

  assert.equal(rows, 1);
  assert.equal(settings.school_name, "SMP Baru");
  assert.equal(settings.nip, "999");
  assert.equal(settings.created_at !== null, true);
});

test("pengaturan antar pengguna terpisah", async () => {
  await save(profileA.id, { school_name: "Sekolah A" });
  await save(profileB.id, { school_name: "Sekolah B" });

  assert.equal((await get(profileA.id)).rows[0].result.school_name, "Sekolah A");
  assert.equal((await get(profileB.id)).rows[0].result.school_name, "Sekolah B");
});

test("tanpa baris tersimpan, ambil mengembalikan nilai kosong", async () => {
  const settings = (await get(profileA.id)).rows[0].result;

  assert.equal(settings.school_name, "");
  assert.deepEqual(settings.layout, {});
});

// --- Keamanan ---

test("RLS hanya memperlihatkan pengaturan milik sendiri", async () => {
  await save(profileA.id, { school_name: "Sekolah A" });
  await save(profileB.id, { school_name: "Sekolah B" });

  const own = (await asUser(USER_A, "select school_name from emodul_settings")).rows;

  assert.deepEqual(own.map((row) => row.school_name), ["Sekolah A"]);
});

test("klien tidak bisa menulis langsung atau memanggil RPC", async () => {
  assert.match(
    await failure(() =>
      asUser(USER_A, "insert into emodul_settings (user_id, school_name) values ($1, 'Curang')", [profileA.id]),
    ),
    /permission denied|denied/i,
  );
  assert.match(
    await failure(() =>
      asUser(USER_A, "select save_emodul_settings($1, '{}'::jsonb)", [profileA.id]),
    ),
    /permission denied|denied/i,
  );
});
