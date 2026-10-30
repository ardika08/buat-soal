// Verifikasi pemeriksaan struktur e-modul.
//
// Validator ini menentukan apakah draf "siap" dan temuan mana yang perlu
// diperbaiki. Uji ini memastikan tiap masalah punya tingkat keparahan yang
// benar, temuan membawa alamat bagian (untuk navigasi), dan urutannya error
// lebih dulu.
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { checkEModulStructure } = await import(
  pathToFileURL(join(root, "src", "lib", "emodulStructure.ts")).href
);

function buildDraft(patch = {}) {
  return {
    id: 1,
    title: "Ekosistem",
    subject: "Ilmu Pengetahuan Alam",
    class_phase: "Fase D - Kelas 7",
    semester: "Ganjil",
    topics: [{ topik: "Ekosistem", capaian: "Menjelaskan komponen ekosistem." }],
    chapters: [
      {
        id: 101,
        order: 1,
        title: "Bab 1: Ekosistem",
        sections: [
          {
            id: 501,
            order: 1,
            kind: "materi",
            title: "Subbab 1.1: Komponen Ekosistem",
            content: "Isi materi yang cukup panjang untuk lolos pemeriksaan struktur.",
          },
          {
            id: 502,
            order: 2,
            kind: "latihan",
            title: "Latihan 1.2",
            content: "Latihan yang juga cukup panjang isinya untuk lolos pemeriksaan.",
          },
        ],
      },
    ],
    ...patch,
  };
}

test("draf lengkap dianggap siap tanpa temuan", () => {
  const report = checkEModulStructure(buildDraft());

  assert.equal(report.ready, true);
  assert.equal(report.findings.length, 0);
  assert.equal(report.errorCount, 0);
});

test("judul modul kosong menjadi error", () => {
  const report = checkEModulStructure(buildDraft({ title: "   " }));

  assert.equal(report.ready, false);
  assert.equal(report.errorCount, 1);
  assert.match(report.findings[0].message, /Judul modul/);
});

test("tanpa topik menjadi error", () => {
  const report = checkEModulStructure(buildDraft({ topics: [] }));

  assert.equal(report.ready, false);
  assert.ok(report.findings.some((finding) => /topik pembelajaran/i.test(finding.message)));
});

test("capaian kosong hanya peringatan (tidak menggagalkan)", () => {
  const report = checkEModulStructure(
    buildDraft({ topics: [{ topik: "Ekosistem", capaian: "" }] }),
  );

  assert.equal(report.ready, true);
  assert.equal(report.warningCount, 1);
  assert.match(report.findings[0].message, /Capaian pembelajaran/);
});

test("bab tanpa subbab materi menjadi error dengan alamat bab", () => {
  const draft = buildDraft();
  draft.chapters[0].sections = [draft.chapters[0].sections[1]]; // sisakan latihan saja

  const report = checkEModulStructure(draft);
  const finding = report.findings.find((item) => /subbab materi/i.test(item.message));

  assert.ok(finding);
  assert.equal(finding.severity, "error");
  assert.equal(finding.chapterId, 101);
});

test("bab tanpa latihan menjadi info", () => {
  const draft = buildDraft();
  draft.chapters[0].sections = [draft.chapters[0].sections[0]]; // sisakan materi saja

  const report = checkEModulStructure(draft);
  const finding = report.findings.find((item) => /belum punya latihan/i.test(item.message));

  assert.ok(finding);
  assert.equal(finding.severity, "info");
  assert.equal(report.ready, true);
});

test("isi bagian kosong menjadi peringatan dengan alamat bagian", () => {
  const draft = buildDraft();
  draft.chapters[0].sections[0].content = "   ";

  const report = checkEModulStructure(draft);
  const finding = report.findings.find((item) => /masih kosong/i.test(item.message));

  assert.ok(finding);
  assert.equal(finding.severity, "warning");
  assert.equal(finding.sectionId, 501);
});

test("isi terlalu pendek diperingatkan", () => {
  const draft = buildDraft();
  draft.chapters[0].sections[0].content = "pendek";

  const report = checkEModulStructure(draft);

  assert.ok(report.findings.some((finding) => /terlalu pendek/i.test(finding.message)));
});

test("temuan diurutkan error lebih dulu", () => {
  // Judul kosong (error) + satu bab tanpa latihan (info).
  const draft = buildDraft({ title: "" });
  draft.chapters[0].sections = [draft.chapters[0].sections[0]];

  const report = checkEModulStructure(draft);

  assert.equal(report.findings[0].severity, "error");
  assert.equal(report.findings[report.findings.length - 1].severity, "info");
});
