// Verifikasi pembuatan e-modul transaksional (potong kredit + simpan struktur).
//
// Uji ini memastikan kredit dipotong tepat sekali, transaksi tercatat, pembuatan
// gagal saat saldo kurang, dan kegagalan di tengah proses benar-benar rollback
// (tidak ada sesi/bab/bagian setengah jadi, kredit tidak berkurang).
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
  join(root, "supabase", "migrations", "20260915010000_emodul_credit_function.sql"),
];
const USER_A = "11111111-1111-4111-8111-111111111111";

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

function chaptersPayload() {
  return [
    {
      order_number: 1,
      title: "Bab 1: Ekosistem",
      sections: [
        { order_number: 1, kind: "materi", title: "Subbab 1.1", content: "Uraian materi." },
        { order_number: 2, kind: "latihan", title: "Latihan 1.2", content: "Soal latihan." },
      ],
    },
    {
      order_number: 2,
      title: "Bab 2: Rantai Makanan",
      sections: [
        { order_number: 1, kind: "materi", title: "Subbab 2.1", content: "Uraian materi 2." },
      ],
    },
  ];
}

function emodulPayload() {
  return {
    title: "Ekosistem",
    topics: [{ topik: "Ekosistem", capaian: "Menjelaskan ekosistem." }],
    fase: "Fase D",
    kelas: "Kelas 7",
    subject: "Ilmu Pengetahuan Alam",
    semester: "Ganjil",
    chapters_target: 2,
    sub_chapters_target: 2,
    exercise_share: 50,
    status: "draft",
  };
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

async function callCreate(requiredCredits, chapters = chaptersPayload()) {
  return db.query(
    "select create_emodul_with_credits($1, $2::jsonb, $3::jsonb, $4, $5) as result",
    [profileA.id, JSON.stringify(emodulPayload()), JSON.stringify(chapters), requiredCredits, "Generate e-modul uji"],
  );
}

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')",
    [USER_A, "emodul-credit@example.com"],
  );
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
});

beforeEach(async () => {
  // Reset state antar-uji: e-modul (cascade), transaksi potongan, dan saldo.
  await db.query("delete from e_modul_sessions");
  await db.query("delete from credit_transactions where type='deduction'");
  await db.query("update profiles set credits_balance=10 where id=$1", [profileA.id]);
});

after(async () => db.close());

test("membuat e-modul memotong kredit, mencatat transaksi, dan menyimpan struktur", async () => {
  const result = (await callCreate(6)).rows[0].result;

  assert.equal(Number(result.credits_remaining), 4);
  assert.equal(Number(result.e_modul.credits_consumed), 6);
  assert.equal(result.e_modul.title, "Ekosistem");
  assert.equal(result.chapters.length, 2);
  assert.deepEqual(
    result.chapters.map((chapter) => Number(chapter.order_number)),
    [1, 2],
  );
  assert.deepEqual(
    result.chapters[0].sections.map((section) => section.kind),
    ["materi", "latihan"],
  );

  const profile = (await db.query("select credits_balance from profiles where id=$1", [profileA.id])).rows[0];
  assert.equal(Number(profile.credits_balance), 4);

  const ledger = (await db.query(
    "select type, amount from credit_transactions where user_id=$1 and type='deduction'",
    [profileA.id],
  )).rows;
  assert.equal(ledger.length, 1);
  assert.equal(Number(ledger[0].amount), -6);
});

test("kredit kurang ditolak dan tidak ada yang tersimpan", async () => {
  await db.query("update profiles set credits_balance=2 where id=$1", [profileA.id]);

  assert.match(await failure(() => callCreate(6)), /insufficient_credits/);

  const sessions = (await db.query("select count(*)::int as n from e_modul_sessions")).rows[0].n;
  const profile = (await db.query("select credits_balance from profiles where id=$1", [profileA.id])).rows[0];
  assert.equal(sessions, 0);
  assert.equal(Number(profile.credits_balance), 2);
});

test("kegagalan di tengah proses rollback total (atomik)", async () => {
  const broken = chaptersPayload();
  broken[1].sections[0].kind = "lainnya"; // melanggar check constraint

  assert.match(await failure(() => callCreate(6, broken)), /check|constraint/i);

  const sessions = (await db.query("select count(*)::int as n from e_modul_sessions")).rows[0].n;
  const chapters = (await db.query("select count(*)::int as n from e_modul_chapters")).rows[0].n;
  const profile = (await db.query("select credits_balance from profiles where id=$1", [profileA.id])).rows[0];
  const ledger = (await db.query("select count(*)::int as n from credit_transactions where type='deduction'")).rows[0].n;

  assert.equal(sessions, 0);
  assert.equal(chapters, 0);
  assert.equal(Number(profile.credits_balance), 10);
  assert.equal(ledger, 0);
});

test("klien tidak bisa memanggil RPC pembuatan e-modul", async () => {
  assert.match(
    await failure(() =>
      asUser(USER_A, "select create_emodul_with_credits($1, '{}'::jsonb, '[]'::jsonb, 1, 'x')", [profileA.id]),
    ),
    /permission denied|denied/i,
  );
});
