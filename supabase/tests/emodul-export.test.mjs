// Verifikasi model dokumen ekspor e-modul (_shared/emodul-export.ts).
//
// Model ini dipakai bersama oleh pembuat DOCX & PDF, jadi urutan blok dan
// pembersihan teks harus benar agar kedua format selalu berisi hal yang sama.
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { buildEModulDocument, buildEModulLetterhead, resolveEModulLayout, slugifyFilename, sanitizePdfText } = await import(
  pathToFileURL(join(root, "supabase", "functions", "_shared", "emodul-export.ts")).href
);

function draft(patch = {}) {
  return {
    title: "Ekosistem dan Keseimbangan Lingkungan",
    subject: "Ilmu Pengetahuan Alam",
    class_phase: "Fase D - Kelas 7",
    semester: "Ganjil",
    topics: [{ topik: "Ekosistem", capaian: "Menjelaskan komponen ekosistem." }],
    chapters: [
      {
        order_number: 1,
        title: "Bab 1: Ekosistem",
        sections: [
          { kind: "materi", title: "Subbab 1.1: Komponen", content: "Uraian materi." },
          { kind: "latihan", title: "Latihan 1.2", content: "Soal latihan." },
        ],
      },
    ],
    ...patch,
  };
}

test("menyusun judul, metadata, dan blok isi berurutan", () => {
  const model = buildEModulDocument(draft());

  assert.equal(model.title, "Ekosistem dan Keseimbangan Lingkungan");
  assert.deepEqual(model.metadata, [
    "Ilmu Pengetahuan Alam · Fase D - Kelas 7 · Semester Ganjil",
    "Topik: Ekosistem",
    "Capaian: Menjelaskan komponen ekosistem.",
  ]);
  assert.deepEqual(model.blocks, [
    { kind: "heading", text: "Bab 1: Ekosistem" },
    { kind: "subheading", text: "Subbab 1.1: Komponen" },
    { kind: "paragraph", text: "Uraian materi." },
    { kind: "subheading", text: "Latihan 1.2" },
    { kind: "paragraph", text: "Soal latihan." },
  ]);
  assert.equal(model.filename, "ekosistem-dan-keseimbangan-lingkungan");
});

test("judul kosong memakai judul pengganti", () => {
  const model = buildEModulDocument(draft({ title: "   " }));
  assert.equal(model.title, "E-Modul");
  assert.equal(model.filename, "e-modul");
});

test("bab/bagian tanpa judul memakai teks pengganti; isi kosong dilewati", () => {
  const model = buildEModulDocument(draft({
    chapters: [
      {
        order_number: 2,
        title: "  ",
        sections: [
          { kind: "materi", title: "  ", content: "   " },
          { kind: "latihan", title: "  ", content: "Soal." },
        ],
      },
    ],
  }));

  assert.deepEqual(model.blocks, [
    { kind: "heading", text: "Bab 2" },
    { kind: "subheading", text: "Subbab" },
    { kind: "subheading", text: "Latihan" },
    { kind: "paragraph", text: "Soal." },
  ]);
});

test("tanpa topik tidak menambah baris topik/capaian", () => {
  const model = buildEModulDocument(draft({ topics: [] }));
  assert.deepEqual(model.metadata, ["Ilmu Pengetahuan Alam · Fase D - Kelas 7 · Semester Ganjil"]);
});

test("nama berkas aman dari karakter khusus", () => {
  assert.equal(slugifyFilename("  Modul: IPA/Bab 1 & 2!  "), "modul-ipa-bab-1-2");
  assert.equal(slugifyFilename(""), "e-modul");
  assert.equal(slugifyFilename("---"), "e-modul");
});

test("teks PDF dibersihkan dari karakter di luar WinAnsi", () => {
  assert.equal(
    sanitizePdfText("“Kutipan” — ‘tunggal’ … 3 × 4 · ekosistem"),
    "\"Kutipan\" - 'tunggal' ... 3 x 4 - ekosistem",
  );
  assert.equal(sanitizePdfText("emoji 😀 dibuang"), "emoji  dibuang");
  assert.equal(sanitizePdfText("baris\ttab"), "baris  tab");
});

// --- Kop identitas sekolah ---

test("kop kosong bila nama sekolah belum diisi", () => {
  assert.equal(buildEModulLetterhead(null), null);
  assert.equal(buildEModulLetterhead({}), null);
  assert.equal(buildEModulLetterhead({ school_name: "   " }), null);
});

test("kop dirapikan dan kontak digabung dari telepon & email", () => {
  const letterhead = buildEModulLetterhead({
    school_name: "  SMP Negeri 1  ",
    address: "  Jalan Merdeka 1  ",
    phone: "  (022) 1234567  ",
    email: "  smpn1@example.sch.id  ",
    headmaster: "  Bu Rina  ",
    nip: "  123456789  ",
  });

  assert.deepEqual(letterhead, {
    school_name: "SMP Negeri 1",
    address: "Jalan Merdeka 1",
    contact: "(022) 1234567 · smpn1@example.sch.id",
    headmaster: "Bu Rina",
    nip: "123456789",
  });
});

test("dokumen menyertakan kop saat diberikan", () => {
  const letterhead = buildEModulLetterhead({ school_name: "SMP Negeri 1" });
  const withKop = buildEModulDocument(draft(), letterhead);
  const withoutKop = buildEModulDocument(draft());

  assert.deepEqual(withKop.letterhead, letterhead);
  assert.equal(withoutKop.letterhead, null);
});

// --- Tata letak ---

test("tata letak kosong/tak dikenal kembali ke default", () => {
  assert.deepEqual(resolveEModulLayout(null), { font_size: "normal", margin: "normal" });
  assert.deepEqual(resolveEModulLayout({ font_size: "raksasa", margin: "mini" }), {
    font_size: "normal",
    margin: "normal",
  });
});

test("tata letak valid dibaca apa adanya", () => {
  assert.deepEqual(resolveEModulLayout({ font_size: "besar", margin: "sempit" }), {
    font_size: "besar",
    margin: "sempit",
  });
  assert.deepEqual(resolveEModulLayout({ font_size: "kecil", margin: "lebar" }), {
    font_size: "kecil",
    margin: "lebar",
  });
});

test("dokumen memakai tata letak default bila tidak diberikan", () => {
  assert.deepEqual(buildEModulDocument(draft()).layout, {
    font_size: "normal",
    margin: "normal",
  });
});

test("dokumen memakai tata letak yang diberikan", () => {
  const layout = { font_size: "besar", margin: "sempit" };
  assert.deepEqual(buildEModulDocument(draft(), null, layout).layout, layout);
});
