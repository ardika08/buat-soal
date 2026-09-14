import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const { analyzeExamQuality } = await import(pathToFileURL(join(root, "src", "lib", "examQuality.ts")).href);

const exam = {
  topics: [{ topik: "Aljabar" }, { topik: "Geometri" }],
};

function question(id, order, patch = {}) {
  return {
    id,
    exam_session_id: 1,
    order_number: order,
    question_type: "Pilihan Ganda",
    cognitive_level: "C2",
    difficulty: "Sedang",
    question_content: `Pertanyaan ${order}`,
    options: { A: "Benar", B: "Salah" },
    correct_answer: "A",
    explanation: null,
    illustration_prompt: null,
    illustration_image: null,
    ...patch,
  };
}

test("menghitung distribusi kesulitan, kognitif, dan topik", () => {
  const result = analyzeExamQuality(exam, [
    question(1, 1, { difficulty: "Mudah", cognitive_level: "C1 - Mengingat" }),
    question(2, 2, { difficulty: "Sulit", cognitive_level: "C4" }),
    question(3, 3, { difficulty: "Sulit", cognitive_level: "" }),
  ]);
  assert.deepEqual(result.difficulty.map(({ label, count }) => ({ label, count })), [
    { label: "Mudah", count: 1 }, { label: "Sulit", count: 2 },
  ]);
  assert.deepEqual(result.cognitive.map(({ label, count }) => ({ label, count })), [
    { label: "C1", count: 1 }, { label: "C4", count: 1 }, { label: "Belum diisi", count: 1 },
  ]);
  assert.deepEqual(result.topics.map(({ label, count }) => ({ label, count })), [
    { label: "Aljabar", count: 2 }, { label: "Geometri", count: 1 },
  ]);
});

test("mendeteksi pertanyaan duplikat setelah normalisasi spasi dan huruf", () => {
  const result = analyzeExamQuality(exam, [
    question(1, 1, { question_content: "Berapa 2 + 2?" }),
    question(2, 2, { question_content: "  BERAPA   2 + 2? " }),
  ]);
  assert.equal(result.warnings[0].kind, "duplicate");
  assert.deepEqual(result.warnings[0].questionNumbers, [1, 2]);
});

test("mendeteksi kunci tidak valid, pilihan kosong, dan pilihan identik", () => {
  const result = analyzeExamQuality(exam, [question(1, 1, {
    options: { A: "Sama", B: " sama ", C: "" },
    correct_answer: "D",
  })]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0].message, /kunci tidak cocok/);
  assert.match(result.warnings[0].message, /pilihan kosong/);
  assert.match(result.warnings[0].message, /pilihan jawaban identik/);
});

test("mengestimasi waktu berdasarkan jenis dan kesulitan", () => {
  const result = analyzeExamQuality(exam, [
    question(1, 1, { question_type: "Pilihan Ganda", difficulty: "Mudah" }),
    question(2, 2, { question_type: "Uraian", difficulty: "Sulit", options: null, correct_answer: "Jawaban" }),
  ]);
  assert.equal(result.estimatedMinutes, 8);
});

test("paket kosong tetap menghasilkan estimasi minimum aman", () => {
  const result = analyzeExamQuality({ topics: [] }, []);
  assert.equal(result.estimatedMinutes, 1);
  assert.deepEqual(result.warnings, []);
});
