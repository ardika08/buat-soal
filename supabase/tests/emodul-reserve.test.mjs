// Verifikasi alur kredit generator e-modul: cadangkan → simpan → kembalikan.
//
// Kredit dicadangkan sebelum AI bekerja. Bila output tidak lengkap atau
// penyimpanan gagal, kredit dikembalikan. Uji ini memastikan `save_emodul`
// tidak menyentuh saldo, pengembalian mengembalikan saldo tepat sekali, dan
// RPC-nya hanya bisa dipanggil service role.
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
  join(root, "supabase", "migrations", "20260912000000_p0_security_hotfix.sql"),
  join(root, "supabase", "migrations", "20260915000000_emodul_schema.sql"),
  join(root, "supabase", "migrations", "20260915020000_emodul_save_function.sql"),
];
const USER_A = "11111111-1111-4111-8111-111111111111";

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
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
        { order_number: 2, kind: "latihan", title: "Latihan 2.2", content: "Soal latihan 2." },
      ],
    },
  ];
}

async function spend(amount, key) {
  return db.query(
    "select spend_credits($1, $2, $3, 'Cadangan uji', 'emodul', null) as result",
    [profileA.id, amount, key],
  );
}

async function refund(amount, key) {
  return db.query(
    "select refund_credits($1, $2, $3, 'Pengembalian uji', 'emodul', null) as result",
    [profileA.id, amount, key],
  );
}

async function save(creditsConsumed) {
  return db.query(
    "select save_emodul($1, $2::jsonb, $3::jsonb, $4) as result",
    [profileA.id, JSON.stringify(emodulPayload()), JSON.stringify(chaptersPayload()), creditsConsumed],
  );
}

before(async () => {
  db = new PGlite();
  for (const file of files) await db.exec(prepareSql(readFileSync(file, "utf8")));

  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')",
    [USER_A, "emodul-reserve@example.com"],
  );
  profileA = (await db.query("select id from profiles where auth_user_id=$1", [USER_A])).rows[0];
});

beforeEach(async () => {
  await db.query("delete from e_modul_sessions");
  await db.query("delete from credit_transactions");
  await db.query("update profiles set credits_balance=10 where id=$1", [profileA.id]);
});

after(async () => db.close());

test("save_emodul menyimpan struktur tanpa mengubah saldo", async () => {
  const saved = (await save(6)).rows[0].result;

  assert.equal(saved.chapters.length, 2);
  assert.equal(Number(saved.e_modul.credits_consumed), 6);

  const profile = (await db.query("select credits_balance from profiles where id=$1", [profileA.id])).rows[0];
  assert.equal(Number(profile.credits_balance), 10);
});

test("cadangkan lalu simpan: kredit terpakai sekali dan sesi tercatat", async () => {
  const reserved = (await spend(6, "reserve-0001")).rows[0].result;
  assert.equal(reserved.applied, true);
  assert.equal(Number(reserved.credits_balance), 4);

  await save(6);

  const profile = (await db.query("select credits_balance from profiles where id=$1", [profileA.id])).rows[0];
  assert.equal(Number(profile.credits_balance), 4);

  const ledger = (await db.query(
    "select type, amount from credit_transactions where user_id=$1 order by id",
    [profileA.id],
  )).rows;
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].type, "deduction");
  assert.equal(Number(ledger[0].amount), -6);
});

test("pengembalian kredit memulihkan saldo tepat sekali", async () => {
  await spend(6, "reserve-0002");
  await refund(6, "refund-reserve-0002");
  await refund(6, "refund-reserve-0002"); // idempoten

  const profile = (await db.query("select credits_balance from profiles where id=$1", [profileA.id])).rows[0];
  assert.equal(Number(profile.credits_balance), 10);

  const refunds = (await db.query(
    "select count(*)::int as n from credit_transactions where user_id=$1 and type='bonus'",
    [profileA.id],
  )).rows[0].n;
  assert.equal(refunds, 1);
});

test("klien tidak bisa memanggil save_emodul", async () => {
  assert.match(
    await failure(() =>
      asUser(USER_A, "select save_emodul($1, '{}'::jsonb, '[]'::jsonb, 0)", [profileA.id]),
    ),
    /permission denied|denied/i,
  );
});
