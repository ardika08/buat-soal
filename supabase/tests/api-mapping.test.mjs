// Uji pemetaan data mentah Supabase -> tipe aplikasi.
//
// Semua data dari database masuk lewat fungsi-fungsi ini. Kalau pemetaannya salah,
// UI tidak error — ia hanya menampilkan hal yang salah (kredit NaN, riwayat kosong,
// jumlah soal hilang) dan pengguna mengira pekerjaannya hilang. Karena itu tiap
// bentuk data yang tidak terduga harus punya jawaban yang pasti, bukan `undefined`
// yang bocor ke layar.
//
// Jalankan: npm run test:api

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const api = await import(pathToFileURL(join(root, "src", "lib", "apiMappers.ts")).href);
const { formatUser, normalizeExam, normalizeQuestion, payloadFromFormData } = api;

// --- Profil pengguna ---

test("formatUser memetakan kolom profil apa adanya", () => {
  const user = formatUser({
    id: 7,
    name: "Bu Dika",
    email: "dika@example.com",
    subscription_tier: "premium",
    credits_balance: 120,
    subscription_expiry: "2026-12-31T00:00:00.000Z",
    has_purchased_credits: true,
  });

  assert.deepEqual(user, {
    id: 7,
    name: "Bu Dika",
    email: "dika@example.com",
    subscription_tier: "premium",
    credits_balance: 120,
    subscription_expiry: "2026-12-31T00:00:00.000Z",
    has_purchased_credits: true,
  });
});

test("formatUser mengubah tier tak dikenal menjadi free, bukan membocorkannya", () => {
  // Kolom ini yang menentukan akses premium. Nilai asing (mis. enum baru, salah ketik,
  // data lama) tidak boleh lolos dan dianggap sebagai hak istimewa.
  for (const tier of [undefined, null, "", "PREMIUM", "gold", 7]) {
    assert.equal(formatUser({ id: 1, subscription_tier: tier }).subscription_tier, "free");
  }
});

test("formatUser menerima tier yang sah", () => {
  for (const tier of ["free", "premium"]) {
    assert.equal(formatUser({ id: 1, subscription_tier: tier }).subscription_tier, tier);
  }
});

test("formatUser menjadikan saldo kredit selalu berupa angka", () => {
  assert.equal(formatUser({ id: 1, credits_balance: "250" }).credits_balance, 250);
  assert.equal(formatUser({ id: 1, credits_balance: null }).credits_balance, 0);
  assert.equal(formatUser({ id: 1 }).credits_balance, 0);
});

test("formatUser hanya menandai riwayat top-up dari boolean eksplisit", () => {
  assert.equal(formatUser({ id: 1, has_purchased_credits: true }).has_purchased_credits, true);
  assert.equal(formatUser({ id: 1, has_purchased_credits: false }).has_purchased_credits, false);
  assert.equal(formatUser({ id: 1 }).has_purchased_credits, false);
});

test("formatUser membedakan langganan tanpa tanggal kedaluwarsa dari yang punya", () => {
  assert.equal(formatUser({ id: 1, subscription_expiry: null }).subscription_expiry, null);
  assert.equal(formatUser({ id: 1 }).subscription_expiry, null);
  assert.equal(
    formatUser({ id: 1, subscription_expiry: "2026-01-01" }).subscription_expiry,
    "2026-01-01",
  );
});

// --- Sesi ujian ---

const EXAM_ROW = {
  id: 11,
  user_id: 3,
  curriculum: "Kurikulum Merdeka",
  exam_type: "Ulangan Harian",
  class_phase: "Fase D",
  subject: "Matematika",
  semester: "Ganjil",
  time_allocation: 90,
  reference_type: "AI",
  difficulty: "Sedang",
  cognitive_levels: ["C1", "C2"],
  pg_options: "A-D",
  include_illustration: true,
  topics: [{ topik: "Aljabar", tujuan: "Menghitung" }],
  credits_consumed: 5,
  created_at: "2026-09-12T10:00:00.000Z",
};

test("normalizeExam memetakan sesi ujian lengkap", () => {
  const exam = normalizeExam(EXAM_ROW);

  assert.equal(exam.id, 11);
  assert.equal(exam.subject, "Matematika");
  assert.equal(exam.time_allocation, 90);
  assert.equal(exam.include_illustration, true);
  assert.deepEqual(exam.cognitive_levels, ["C1", "C2"]);
  assert.deepEqual(exam.topics, [{ topik: "Aljabar", tujuan: "Menghitung" }]);
  assert.equal(exam.credits_consumed, 5);
});

test("normalizeExam memakai daftar kosong untuk kolom array yang hilang", () => {
  // `topics.map` di UI akan meledak kalau ini null, dan riwayat ujian gagal tampil.
  const exam = normalizeExam({ ...EXAM_ROW, topics: null, cognitive_levels: undefined });

  assert.deepEqual(exam.topics, []);
  assert.deepEqual(exam.cognitive_levels, []);
});

test("normalizeExam tidak menyalin array dari bentuk yang salah", () => {
  const exam = normalizeExam({ ...EXAM_ROW, topics: "Aljabar", cognitive_levels: { a: 1 } });

  assert.deepEqual(exam.topics, []);
  assert.deepEqual(exam.cognitive_levels, []);
});

test("normalizeExam menjadikan include_illustration boolean sungguhan", () => {
  assert.equal(normalizeExam({ ...EXAM_ROW, include_illustration: null }).include_illustration, false);
  assert.equal(normalizeExam({ ...EXAM_ROW, include_illustration: undefined }).include_illustration, false);
});

test("normalizeExam mempertahankan pg_options null sebagai null", () => {
  assert.equal(normalizeExam({ ...EXAM_ROW, pg_options: null }).pg_options, null);
  assert.equal(normalizeExam({ ...EXAM_ROW, pg_options: "" }).pg_options, null);
});

// --- Soal ---

const QUESTION_ROW = {
  id: 101,
  exam_session_id: 11,
  order_number: 1,
  question_type: "pilihan_ganda",
  cognitive_level: "C2",
  difficulty: "Mudah",
  question_content: "Berapa 2 + 2?",
  options: { A: "3", B: "4" },
  correct_answer: "B",
  explanation: "Karena 2 ditambah 2 sama dengan 4.",
  illustration_prompt: null,
  illustration_image: null,
};

test("normalizeQuestion memetakan soal lengkap", () => {
  const question = normalizeQuestion(QUESTION_ROW);

  assert.equal(question.id, 101);
  assert.equal(question.exam_session_id, 11);
  assert.equal(question.order_number, 1);
  assert.equal(question.question_content, "Berapa 2 + 2?");
  assert.deepEqual(question.options, { A: "3", B: "4" });
  assert.equal(question.correct_answer, "B");
  assert.equal(question.explanation, "Karena 2 ditambah 2 sama dengan 4.");
});

test("normalizeQuestion menjadikan pembahasan kosong sebagai null, bukan string 'null'", () => {
  assert.equal(normalizeQuestion({ ...QUESTION_ROW, explanation: null }).explanation, null);
  assert.equal(normalizeQuestion({ ...QUESTION_ROW, explanation: "" }).explanation, null);
  assert.equal(normalizeQuestion(QUESTION_ROW).explanation, "Karena 2 ditambah 2 sama dengan 4.");
});

test("normalizeQuestion menerima soal esai tanpa pilihan jawaban", () => {
  const question = normalizeQuestion({ ...QUESTION_ROW, options: null, correct_answer: "kunci" });

  assert.equal(question.options, null);
  assert.equal(question.correct_answer, "kunci");
});

test("normalizeQuestion mengosongkan kolom opsional yang hilang, bukan menulis undefined", () => {
  const question = normalizeQuestion({ ...QUESTION_ROW, cognitive_level: null, difficulty: undefined });

  assert.equal(question.cognitive_level, "");
  assert.equal(question.difficulty, "");
  assert.equal(question.illustration_prompt, null);
  assert.equal(question.illustration_image, null);
});

test("normalizeQuestion tidak meneruskan array sebagai objek pilihan", () => {
  const question = normalizeQuestion({ ...QUESTION_ROW, options: ["A", "B"] });

  assert.equal(question.options, null);
});

// --- Formulir pembuatan soal ---

test("payloadFromFormData membaca bidang skalar beserta nilai bawaannya", () => {
  const formData = new FormData();
  formData.set("curriculum", "Kurikulum Merdeka");
  formData.set("subject", "Biologi");

  return payloadFromFormData(formData).then((payload) => {
    assert.equal(payload.curriculum, "Kurikulum Merdeka");
    assert.equal(payload.subject, "Biologi");
    assert.equal(payload.time_allocation, 90, "alokasi waktu punya nilai bawaan");
    assert.equal(payload.reference_type, "AI");
    assert.equal(payload.pg_options, null, "pg_options kosong menjadi null");
  });
});

test("payloadFromFormData mengubah distribusi kesulitan menjadi angka", () => {
  const formData = new FormData();
  formData.set("difficulty_distribution[lots]", "60");
  formData.set("difficulty_distribution[mots]", "25");
  formData.set("difficulty_distribution[hots]", "15");

  return payloadFromFormData(formData).then((payload) => {
    assert.deepEqual(payload.difficulty_distribution, { lots: 60, mots: 25, hots: 15 });
  });
});

test("payloadFromFormData memakai distribusi bawaan bila tidak diisi", () => {
  return payloadFromFormData(new FormData()).then((payload) => {
    assert.deepEqual(payload.difficulty_distribution, { lots: 50, mots: 30, hots: 20 });
  });
});

test("payloadFromFormData mengurutkan formats berdasarkan indeks, bukan urutan field", () => {
  // Urutan field di FormData mengikuti urutan input di DOM. Kalau tidak diurutkan
  // lewat indeks, daftar format bisa terbalik dan jumlah soal per format tertukar.
  const formData = new FormData();
  formData.set("formats[1][id]", "esai");
  formData.set("formats[1][label]", "Esai");
  formData.set("formats[1][count]", "2");
  formData.set("formats[0][id]", "pg");
  formData.set("formats[0][label]", "Pilihan Ganda");
  formData.set("formats[0][count]", "3");

  return payloadFromFormData(formData).then((payload) => {
    assert.deepEqual(payload.formats, [
      { id: "pg", label: "Pilihan Ganda", count: 3 },
      { id: "esai", label: "Esai", count: 2 },
    ]);
  });
});

test("payloadFromFormData membaca topik berindeks", () => {
  const formData = new FormData();
  formData.set("topics[0][topik]", "Fotosintesis");
  formData.set("topics[0][tujuan]", "Menjelaskan proses");
  formData.set("topics[1][topik]", "Respirasi");
  formData.set("topics[1][tujuan]", "Membandingkan");

  return payloadFromFormData(formData).then((payload) => {
    assert.deepEqual(payload.topics, [
      { topik: "Fotosintesis", tujuan: "Menjelaskan proses" },
      { topik: "Respirasi", tujuan: "Membandingkan" },
    ]);
  });
});

test("payloadFromFormData membaca level kognitif berindeks", () => {
  const formData = new FormData();
  formData.set("cognitive_levels[1]", "C3");
  formData.set("cognitive_levels[0]", "C1");

  return payloadFromFormData(formData).then((payload) => {
    assert.deepEqual(payload.cognitive_levels, ["C1", "C3"]);
  });
});

test("payloadFromFormData mengenali include_illustration dalam beberapa bentuk", () => {
  const cases = [
    ["1", true],
    ["true", true],
    ["on", true],
    ["0", false],
    ["", false],
  ];

  return Promise.all(cases.map(([raw, expected]) => {
    const formData = new FormData();
    formData.set("include_illustration", raw);
    return payloadFromFormData(formData).then((payload) => {
      assert.equal(payload.include_illustration, expected, `nilai ${raw || "(kosong)"}`);
    });
  }));
});

test("payloadFromFormData tanpa berkas tidak mengirim kolom berkas sama sekali", () => {
  return payloadFromFormData(new FormData()).then((payload) => {
    assert.equal("reference_file_name" in payload, false);
    assert.equal("reference_file_base64" in payload, false);
  });
});
