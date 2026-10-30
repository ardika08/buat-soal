// Verifikasi ringkasan draf terakhir untuk beranda.
//
// `buildRecentDrafts` mengubah sesi ujian terakhir menjadi bentuk ringkas yang
// aman ditampilkan. Uji ini memastikan tidak ada `undefined` yang bocor ke layar
// dan draf e-modul tetap `null` selama tabelnya belum ada.
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

// Node >= 23 bisa mengimpor .ts langsung (type stripping). Specifier harus berupa URL
// (bukan path Windows) supaya loader ESM mau menyelesaikannya.
async function loadDrafts() {
  const module = await import(pathToFileURL(join(root, "supabase", "functions", "_shared", "drafts.ts")).href);
  if (typeof module.buildRecentDrafts !== "function") {
    throw new Error("buildRecentDrafts tidak ditemukan — periksa supabase/functions/_shared/drafts.ts.");
  }
  return { buildRecentDrafts: module.buildRecentDrafts, buildExamDraft: module.buildExamDraft };
}

const { buildRecentDrafts, buildExamDraft } = await loadDrafts();

test("memetakan sesi ujian terakhir menjadi draf soal", () => {
  const drafts = buildRecentDrafts({
    exam: {
      id: 42,
      subject: "Matematika",
      class_phase: "Kelas 7 · Fase D",
      exam_type: "Ulangan Harian",
      created_at: "2026-10-01T08:00:00.000Z",
    },
    questionsCount: 20,
  });

  assert.deepEqual(drafts.exam_draft, {
    id: 42,
    subject: "Matematika",
    class_phase: "Kelas 7 · Fase D",
    exam_type: "Ulangan Harian",
    created_at: "2026-10-01T08:00:00.000Z",
    questions_count: 20,
  });
  assert.equal(drafts.e_modul_draft, null);
});

test("tidak ada ujian menghasilkan draf soal null, bukan objek kosong", () => {
  assert.equal(buildRecentDrafts({}).exam_draft, null);
  assert.equal(buildRecentDrafts({ exam: null }).exam_draft, null);
  assert.equal(buildExamDraft(undefined), null);
  assert.equal(buildExamDraft({ id: null }), null);
});

test("nilai hilang menghasilkan default yang pasti, bukan undefined", () => {
  const draft = buildExamDraft({ id: 1 });
  assert.equal(draft.id, 1);
  assert.equal(draft.subject, "");
  assert.equal(draft.class_phase, "");
  assert.equal(draft.exam_type, "");
  assert.equal(draft.created_at, null);
  assert.equal(draft.questions_count, 0);
});

test("jumlah soal tak terduga jatuh ke 0", () => {
  assert.equal(buildExamDraft({ id: 1 }, Number.NaN).questions_count, 0);
  assert.equal(buildExamDraft({ id: 1 }, undefined).questions_count, 0);
  assert.equal(buildExamDraft({ id: 1 }, 7).questions_count, 7);
});

test("draf e-modul diteruskan apa adanya bila tersedia", () => {
  const eModul = {
    id: "emodul-1",
    title: "Ekosistem",
    subject: "IPA",
    class_phase: "Kelas 7 · Fase D",
    chapters: 4,
    progress: 65,
    updated_at: "2026-10-13T09:30:00.000Z",
  };

  assert.deepEqual(buildRecentDrafts({ eModul }).e_modul_draft, eModul);
});
