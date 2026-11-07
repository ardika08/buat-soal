// Verifikasi kontrak generator e-modul (murni) di _shared/emodul-schema.ts.
//
// Kontrak ini menentukan payload yang sah, biaya kredit, dan normalisasi
// keluaran AI. Kalau salah, sesi bisa tersimpan dengan struktur rusak atau
// biaya kredit tidak sesuai.
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const schema = await import(
  pathToFileURL(join(root, "supabase", "functions", "_shared", "emodul-schema.ts")).href
);
const {
  validateGeneratePayload,
  emodulCreditCost,
  exercisesPerChapter,
  normalizeEModulOutput,
  buildEModulPrompt,
  validateEModulCompleteness,
  buildRegenerateSectionPrompt,
  normalizeRegeneratedSection,
  EMODUL_REGENERATE_COST,
} = schema;

const basePayload = {
  topics: [{ topik: "Ekosistem", capaian: "Menjelaskan komponen ekosistem." }],
  fase: "Fase D",
  kelas: "Kelas 7",
  subject: "Ilmu Pengetahuan Alam",
  semester: "Ganjil",
  chapters: 1,
  sub_chapters: 2,
  exercise_share: 50,
};

test("payload lengkap lolos validasi", () => {
  assert.equal(validateGeneratePayload(basePayload), null);
});

test("jumlah bab wajib sama dengan jumlah materi dan maksimal 12", () => {
  assert.match(validateGeneratePayload({ ...basePayload, chapters: 2 }), /sama dengan jumlah materi/i);
  assert.match(validateGeneratePayload({ ...basePayload, topics: Array(13).fill({ topik: "T", capaian: "C" }), chapters: 13 }), /maksimal 12/i);
});

test("topik/capaian wajib diisi", () => {
  assert.match(validateGeneratePayload({ ...basePayload, topics: [] }), /topik/i);
  assert.match(
    validateGeneratePayload({ ...basePayload, topics: [{ topik: "Ekosistem", capaian: "  " }] }),
    /capaian/i,
  );
});

test("field jenjang wajib diisi", () => {
  assert.match(validateGeneratePayload({ ...basePayload, fase: " " }), /fase/i);
  assert.match(validateGeneratePayload({ ...basePayload, subject: "" }), /subject/i);
});

test("jumlah bab/subbab dan porsi latihan dibatasi", () => {
  assert.match(validateGeneratePayload({ ...basePayload, chapters: 0 }), /bab/i);
  assert.match(validateGeneratePayload({ ...basePayload, chapters: 13 }), /bab/i);
  assert.match(validateGeneratePayload({ ...basePayload, sub_chapters: 7 }), /subbab/i);
  assert.match(validateGeneratePayload({ ...basePayload, exercise_share: 61 }), /latihan/i);
});

test("biaya kredit = bab x subbab, minimal 1", () => {
  assert.equal(emodulCreditCost(basePayload), 2);
  assert.equal(emodulCreditCost({ ...basePayload, sub_chapters: 1 }), 1);
});

test("perkiraan latihan per bab mengikuti porsi", () => {
  assert.equal(exercisesPerChapter({ ...basePayload, sub_chapters: 2, exercise_share: 50 }), 1);
  assert.equal(exercisesPerChapter({ ...basePayload, sub_chapters: 2, exercise_share: 0 }), 0);
  assert.equal(exercisesPerChapter({ ...basePayload, sub_chapters: 5, exercise_share: 60 }), 3);
});

test("normalisasi merapikan teks, membuang bagian kosong, dan menomori ulang", () => {
  const output = normalizeEModulOutput(
    {
      title: "  Ekosistem dan Lingkungan  ",
      chapters: [
        {
          title: "  Bab 1: Ekosistem  ",
          sections: [
            { kind: "materi", title: "  Subbab 1.1  ", content: "  Uraian materi.  " },
            { kind: "latihan", title: "  Latihan 1.1  ", content: "  Soal latihan.  " },
            { kind: "materi", title: "   ", content: "Tanpa judul — dibuang." },
          ],
        },
      ],
    },
    basePayload,
  );

  assert.equal(output.title, "Ekosistem dan Lingkungan");
  assert.equal(output.chapters.length, 1);
  assert.equal(output.chapters[0].order_number, 1);
  assert.equal(output.chapters[0].title, "Bab 1: Ekosistem");
  assert.deepEqual(
    output.chapters[0].sections.map((section) => section.order_number),
    [1, 2],
  );
  assert.equal(output.chapters[0].sections[0].title, "Subbab 1.1");
  assert.equal(output.chapters[0].sections[0].content, "Uraian materi.");
});

test("judul Pendalaman Materi dinormalisasi sesuai format dan topik BAB", () => {
  const output = normalizeEModulOutput({
    chapters: [{
      title: "Bab 1: Ekosistem",
      sections: [
        { kind: "materi", title: "Pendalaman Materi 1.1: Mengenal Ekosistem", content: "Uraian." },
      ],
    }],
  }, basePayload);
  assert.equal(output.chapters[0].sections[0].title, "A. Pendalaman Materi Ekosistem");
});

test("judul kosong memakai topik pertama sebagai pengganti", () => {
  const output = normalizeEModulOutput(
    {
      chapters: [
        {
          title: "Bab 1",
          sections: [{ kind: "materi", title: "Subbab 1.1", content: "Isi." }],
        },
      ],
    },
    basePayload,
  );

  assert.equal(output.title, "Ekosistem");
});

test("output tanpa bab ditolak", () => {
  assert.throws(() => normalizeEModulOutput({ title: "X" }, basePayload), /tidak memuat bab/i);
  assert.throws(
    () => normalizeEModulOutput({ chapters: [] }, basePayload),
    /tidak memuat bab/i,
  );
});

test("jenis bagian di luar materi/latihan ditolak", () => {
  assert.throws(
    () =>
      normalizeEModulOutput(
        {
          chapters: [
            {
              title: "Bab 1",
              sections: [{ kind: "lainnya", title: "X", content: "Y" }],
            },
          ],
        },
        basePayload,
      ),
    /tidak dikenal/i,
  );
});

test("prompt mengunci jumlah submateri dan format judul pendalaman", () => {
  const prompt = buildEModulPrompt(basePayload);

  assert.match(prompt, /jumlah_submateri_per_bab":2/);
  assert.match(prompt, /A\. Pendalaman Materi/);
  assert.match(prompt, /1\.1/);
  assert.match(prompt, /1\.2/);
});

test("prompt memuat jenjang, jumlah bab, dan topik", () => {
  const prompt = buildEModulPrompt(basePayload);

  assert.match(prompt, /Fase D/);
  assert.match(prompt, /Ilmu Pengetahuan Alam/);
  assert.match(prompt, /jumlah_bab/);
  assert.match(prompt, /Ekosistem/);
});

// --- Kelengkapan output terhadap permintaan ---

function chapterOutput(order, sections) {
  return { order_number: order, title: `Bab ${order}`, sections };
}

function sectionOutput(order, kind) {
  return {
    order_number: order,
    kind,
    title: `${kind === "latihan" ? "Latihan" : "Subbab"} ${order}`,
    content: "Isi bagian yang cukup panjang.",
  };
}

function validOutput() {
  // basePayload: 3 bab, 2 bagian/bab, 50% latihan → 1 materi + 1 latihan per bab.
  return {
    title: "Ekosistem",
    chapters: [1, 2, 3].map((order) =>
      chapterOutput(order, [sectionOutput(1, "materi"), sectionOutput(2, "latihan")]),
    ),
  };
}

test("output lengkap lolos pemeriksaan kelengkapan", () => {
  const output = {
    title: "Ekosistem",
    chapters: [chapterOutput(1, [
      { ...sectionOutput(1, "materi"), title: "Pertanyaan Pemantik" },
      { ...sectionOutput(2, "materi"), title: "Peta Konsep" },
      { ...sectionOutput(3, "materi"), title: "A. Pendalaman Materi Ekosistem" },
      { ...sectionOutput(4, "materi"), title: "1.1 Komponen Ekosistem" },
      { ...sectionOutput(5, "materi"), title: "1.2 Interaksi Ekosistem" },
      { ...sectionOutput(6, "latihan"), title: "Uji Capaian Pembelajaran" },
    ])],
  };
  assert.deepEqual(validateEModulCompleteness(output, basePayload), { ok: true, reason: null });
});

test("jumlah bab tidak sesuai ditolak", () => {
  const output = validOutput();
  output.chapters.pop();

  const check = validateEModulCompleteness(output, basePayload);
  assert.equal(check.ok, false);
  assert.match(check.reason, /Jumlah bab/i);
});

test("bagian wajib tiap bab harus tersedia", () => {
  const output = {
    title: "Ekosistem",
    chapters: [chapterOutput(1, [
      { ...sectionOutput(1, "materi"), title: "Pertanyaan Pemantik" },
      { ...sectionOutput(2, "materi"), title: "Peta Konsep" },
      { ...sectionOutput(3, "materi"), title: "A. Pendalaman Materi Ekosistem" },
      { ...sectionOutput(4, "materi"), title: "1.1 Komponen Ekosistem" },
      { ...sectionOutput(5, "materi"), title: "1.2 Interaksi Ekosistem" },
    ])],
  };
  const check = validateEModulCompleteness(output, basePayload);
  assert.equal(check.ok, false);
  assert.match(check.reason, /Uji Capaian Pembelajaran/i);
});

test("jumlah submateri harus tepat dan judul induk tidak dihitung", () => {
  const baseSections = [
    { ...sectionOutput(1, "materi"), title: "Pertanyaan Pemantik" },
    { ...sectionOutput(2, "materi"), title: "Peta Konsep" },
    { ...sectionOutput(3, "materi"), title: "A. Pendalaman Materi Ekosistem" },
    { ...sectionOutput(4, "materi"), title: "1.1 Komponen Ekosistem" },
    { ...sectionOutput(5, "materi"), title: "1.2 Interaksi Ekosistem" },
    { ...sectionOutput(6, "latihan"), title: "Uji Capaian Pembelajaran" },
  ];
  const valid = { title: "Ekosistem", chapters: [chapterOutput(1, baseSections)] };
  assert.deepEqual(validateEModulCompleteness(valid, basePayload), { ok: true, reason: null });

  const tooFew = structuredClone(valid);
  tooFew.chapters[0].sections.splice(4, 1);
  assert.match(validateEModulCompleteness(tooFew, basePayload).reason, /tepat 2 submateri/i);

  const tooMany = structuredClone(valid);
  tooMany.chapters[0].sections.splice(5, 0, { ...sectionOutput(6, "materi"), title: "1.3 Keanekaragaman" });
  assert.match(validateEModulCompleteness(tooMany, basePayload).reason, /tepat 2 submateri/i);

  const numberedHeading = structuredClone(valid);
  numberedHeading.chapters[0].sections[2].title = "1.1 Pendalaman Materi Ekosistem";
  assert.match(validateEModulCompleteness(numberedHeading, basePayload).reason, /judul induk/i);
});

// --- Regenerasi satu bagian ---

test("biaya regenerasi satu bagian adalah satu kredit", () => {
  assert.equal(EMODUL_REGENERATE_COST, 1);
});

test("normalisasi hasil regenerasi merapikan teks", () => {
  assert.equal(normalizeRegeneratedSection({ content: "  Teks baru  " }), "Teks baru");
});

test("hasil regenerasi tanpa isi ditolak", () => {
  assert.throws(() => normalizeRegeneratedSection({}), /tidak memuat isi/i);
  assert.throws(() => normalizeRegeneratedSection({ content: "   " }), /tidak memuat isi/i);
});

test("prompt regenerasi memuat konteks bagian dan instruksi", () => {
  const prompt = buildRegenerateSectionPrompt({
    subject: "Ilmu Pengetahuan Alam",
    fase: "Fase D",
    kelas: "Kelas 7",
    semester: "Ganjil",
    module_title: "Ekosistem",
    chapter_title: "Bab 1: Ekosistem",
    kind: "latihan",
    title: "Latihan 1.2",
    current_content: "Soal lama.",
    instruction: "buat lebih menantang",
  });

  assert.match(prompt, /Latihan 1\.2/);
  assert.match(prompt, /Ekosistem/);
  assert.match(prompt, /buat lebih menantang/);
  assert.match(prompt, /latihan/);
});
