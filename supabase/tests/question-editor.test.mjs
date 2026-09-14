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
];
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function prepareSql(sql) {
  return sql.replace(/^\s*create extension if not exists pgcrypto;\s*$/gim, "");
}

let db;
let profileA;
let examId;
let questionIds;

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

  for (const [id, email] of [[USER_A, "a@example.com"], [USER_B, "b@example.com"]]) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, email]);
  }
  profileA = (await db.query("select * from profiles where auth_user_id = $1", [USER_A])).rows[0];
  const exam = await db.query(
    "insert into exam_sessions (user_id, curriculum, exam_type, class_phase, subject, semester, time_allocation, reference_type, difficulty) values ($1,'Merdeka','Ujian','Fase C','IPA','Ganjil',60,'AI','Sedang') returning id",
    [profileA.id],
  );
  examId = exam.rows[0].id;
  const questions = await db.query(
    "insert into questions (exam_session_id, order_number, question_type, question_content, options, correct_answer) values ($1,1,'Pilihan Ganda','Q1','{\"A\":\"a\",\"B\":\"b\"}','A'), ($1,2,'Pilihan Ganda','Q2','{\"A\":\"a\",\"B\":\"b\"}','B') returning id, order_number",
    [examId],
  );
  questionIds = questions.rows
    .sort((a, b) => Number(a.order_number) - Number(b.order_number))
    .map((row) => row.id);
});

after(async () => db.close());

test("pemilik bisa mengubah soal valid, user lain ditolak", async () => {
  const payload = JSON.stringify({
    question_type: "Pilihan Ganda", cognitive_level: "C2", difficulty: "Sedang",
    question_content: "Soal diperbarui", options: { A: "ya", B: "tidak" },
    correct_answer: "A", explanation: "Karena A",
  });
  const own = await asUser(USER_A, "select update_exam_question($1,$2,$3::jsonb) as q", [examId, questionIds[0], payload]);
  assert.equal(own.rows[0].q.question_content, "Soal diperbarui");
  assert.match(await failure(() => asUser(USER_B, "select update_exam_question($1,$2,$3::jsonb)", [examId, questionIds[0], payload])), /forbidden/);
});

test("validasi menolak pertanyaan kosong dan kunci opsi tidak valid", async () => {
  const empty = JSON.stringify({ question_content: "", correct_answer: "A", options: { A: "ya", B: "tidak" } });
  assert.match(await failure(() => asUser(USER_A, "select update_exam_question($1,$2,$3::jsonb)", [examId, questionIds[0], empty])), /question_required/);
  const invalid = JSON.stringify({ question_content: "Valid", correct_answer: "C", options: { A: "ya", B: "tidak" } });
  assert.match(await failure(() => asUser(USER_A, "select update_exam_question($1,$2,$3::jsonb)", [examId, questionIds[0], invalid])), /invalid_answer_key/);
});

test("tambah, reorder, dan hapus menjaga nomor urut rapat", async () => {
  const added = await asUser(USER_A, "select add_exam_question($1,$2,$3::jsonb) as q", [examId, 1, JSON.stringify({ question_content: "Draft", correct_answer: "A", options: { A: "a", B: "b" } })]);
  const addedId = added.rows[0].q.id;
  const reordered = await asUser(USER_A, "select reorder_exam_questions($1,$2::bigint[]) as r", [examId, [questionIds[1], addedId, questionIds[0]]]);
  assert.deepEqual(reordered.rows[0].r.questions.map((q) => Number(q.order_number)), [1, 2, 3]);
  await asUser(USER_A, "select delete_exam_question($1,$2)", [examId, addedId]);
  const rows = (await db.query("select order_number from questions where exam_session_id=$1 order by order_number", [examId])).rows;
  assert.deepEqual(rows.map((row) => Number(row.order_number)), [1, 2]);
});

test("regenerasi idempoten memotong kredit sekali", async () => {
  const payload = JSON.stringify({ question_content: "Versi AI", options: { A: "1", B: "2" }, correct_answer: "B" });
  const key = "regen-test-1";
  const first = await db.query("select regenerate_question_with_credit($1,$2,$3::jsonb,1,$4) as r", [profileA.id, questionIds[0], payload, key]);
  const second = await db.query("select regenerate_question_with_credit($1,$2,$3::jsonb,1,$4) as r", [profileA.id, questionIds[0], payload, key]);
  assert.equal(Number(first.rows[0].r.credits_remaining), 9);
  assert.equal(Number(second.rows[0].r.credits_remaining), 9);
  assert.equal(second.rows[0].r.reused, true);
});
