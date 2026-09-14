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
  join(root, "supabase", "migrations", "20260912000000_p0_security_hotfix.sql"),
  join(root, "supabase", "migrations", "20260914000000_question_editor.sql"),
  join(root, "supabase", "migrations", "20260914010000_question_bank.sql"),
];
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

let db;
let profileA;
let profileB;
let examA;
let examB;
let questionA1;
let questionA2;
let questionB;
let bankA1;
let bankA2;

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

  for (const [id, email] of [[USER_A, "bank-a@example.com"], [USER_B, "bank-b@example.com"]]) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, email]);
  }
  profileA = (await db.query("select * from profiles where auth_user_id=$1", [USER_A])).rows[0];
  profileB = (await db.query("select * from profiles where auth_user_id=$1", [USER_B])).rows[0];

  examA = (await db.query(
    "insert into exam_sessions (user_id,curriculum,exam_type,class_phase,subject,semester,time_allocation,reference_type,difficulty,topics) values ($1,'Merdeka','Ujian','Fase C','IPA','Ganjil',60,'AI','Sedang',$2::jsonb) returning id",
    [profileA.id, JSON.stringify([{ topik: "Energi" }])],
  )).rows[0].id;
  examB = (await db.query(
    "insert into exam_sessions (user_id,curriculum,exam_type,class_phase,subject,semester,time_allocation,reference_type,difficulty,topics) values ($1,'Merdeka','Ujian','Fase D','IPS','Ganjil',60,'AI','Sedang','{}'::jsonb) returning id",
    [profileB.id],
  )).rows[0].id;

  const questionsA = (await db.query(
    "insert into questions (exam_session_id,order_number,question_type,cognitive_level,difficulty,question_content,options,correct_answer,explanation) values ($1,1,'Pilihan Ganda','C2','Mudah','Energi matahari berasal dari?',$2::jsonb,'A','Matahari'),($1,2,'Uraian','C3','Sedang','Jelaskan perubahan energi.',null,'Energi berubah bentuk','Pembahasan awal') returning id,order_number",
    [examA, JSON.stringify({ A: "Matahari", B: "Bulan" })],
  )).rows.sort((a, b) => Number(a.order_number) - Number(b.order_number));
  questionA1 = questionsA[0].id;
  questionA2 = questionsA[1].id;
  questionB = (await db.query(
    "insert into questions (exam_session_id,order_number,question_type,difficulty,question_content,options,correct_answer) values ($1,1,'Uraian','Sulit','Soal milik B',null,'Jawaban B') returning id",
    [examB],
  )).rows[0].id;
});

after(async () => db.close());

test("pemilik menyimpan soal dan metadata topik dengan aman", async () => {
  const saved = await asUser(USER_A, "select save_questions_to_bank($1::bigint[]) as result", [[questionA1, questionA2]]);
  assert.deepEqual(saved.rows[0].result, { requested: 2, saved: 2, duplicates: 0 });
  const rows = (await asUser(USER_A, "select id,source_question_id,topic from question_bank order by id")).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].topic, "Energi");
  bankA1 = rows[0].id;
  bankA2 = rows[1].id;
});

test("user lain tidak bisa menyimpan soal yang bukan miliknya", async () => {
  assert.match(
    await failure(() => asUser(USER_B, "select save_questions_to_bank($1::bigint[])", [[questionA1]])),
    /forbidden/,
  );
});

test("penyimpanan ulang mendeteksi duplikat", async () => {
  const result = await asUser(USER_A, "select save_questions_to_bank($1::bigint[]) as result", [[questionA1]]);
  assert.deepEqual(result.rows[0].result, { requested: 1, saved: 0, duplicates: 1 });
});

test("snapshot tidak berubah saat sumber diedit lalu dihapus", async () => {
  await db.query("update questions set question_content='Sumber berubah', explanation='Berubah' where id=$1", [questionA1]);
  let snapshot = (await asUser(USER_A, "select question_content,explanation from question_bank where id=$1", [bankA1])).rows[0];
  assert.equal(snapshot.question_content, "Energi matahari berasal dari?");
  assert.equal(snapshot.explanation, "Matahari");

  await db.query("delete from questions where id=$1", [questionA1]);
  snapshot = (await asUser(USER_A, "select source_question_id,question_content from question_bank where id=$1", [bankA1])).rows[0];
  assert.equal(snapshot.source_question_id, null);
  assert.equal(snapshot.question_content, "Energi matahari berasal dari?");
});

test("RLS hanya menampilkan bank milik user aktif", async () => {
  await asUser(USER_B, "select save_questions_to_bank($1::bigint[])", [[questionB]]);
  const ownA = await asUser(USER_A, "select question_content from question_bank order by id");
  const ownB = await asUser(USER_B, "select question_content from question_bank order by id");
  assert.equal(ownA.rows.length, 2);
  assert.deepEqual(ownB.rows.map((row) => row.question_content), ["Soal milik B"]);
});

test("paket baru menjaga urutan dan tidak memotong kredit", async () => {
  const beforeCredits = Number((await db.query("select credits_balance from profiles where id=$1", [profileA.id])).rows[0].credits_balance);
  const created = await asUser(USER_A, "select create_exam_from_bank($1::bigint[],$2) as result", [[bankA2, bankA1], "Paket Lama"]);
  const result = created.rows[0].result;
  const rows = (await db.query("select question_content,order_number from questions where exam_session_id=$1 order by order_number", [result.exam_id])).rows;
  const afterCredits = Number((await db.query("select credits_balance from profiles where id=$1", [profileA.id])).rows[0].credits_balance);
  assert.equal(result.questions_added, 2);
  assert.deepEqual(rows.map((row) => row.question_content), ["Jelaskan perubahan energi.", "Energi matahari berasal dari?"]);
  assert.deepEqual(rows.map((row) => Number(row.order_number)), [1, 2]);
  assert.equal(afterCredits, beforeCredits);
});

test("append menambah soal unik dan melewati soal identik", async () => {
  const target = (await db.query(
    "insert into exam_sessions (user_id,curriculum,exam_type,class_phase,subject,semester,time_allocation,reference_type,difficulty) values ($1,'Merdeka','Target','Fase C','IPA','Ganjil',60,'AI','Sedang') returning id",
    [profileA.id],
  )).rows[0].id;
  await db.query(
    "insert into questions (exam_session_id,order_number,question_type,difficulty,question_content,options,correct_answer) values ($1,1,'Pilihan Ganda','Mudah','Energi matahari berasal dari?',$2::jsonb,'A')",
    [target, JSON.stringify({ A: "Matahari", B: "Bulan" })],
  );
  const appended = await asUser(USER_A, "select append_bank_to_exam($1,$2::bigint[]) as result", [target, [bankA1, bankA2]]);
  assert.equal(appended.rows[0].result.added, 1);
  assert.equal(appended.rows[0].result.duplicates, 1);
  const rows = (await db.query("select order_number from questions where exam_session_id=$1 order by order_number", [target])).rows;
  assert.deepEqual(rows.map((row) => Number(row.order_number)), [1, 2]);
});

test("user tidak bisa append ke ujian user lain", async () => {
  assert.match(
    await failure(() => asUser(USER_A, "select append_bank_to_exam($1,$2::bigint[])", [examB, [bankA1]])),
    /forbidden/,
  );
});

test("user tidak bisa menghapus bank user lain", async () => {
  const bankB = (await asUser(USER_B, "select id from question_bank limit 1")).rows[0].id;
  assert.match(
    await failure(() => asUser(USER_A, "select delete_bank_question($1)", [bankB])),
    /not_found/,
  );
});
