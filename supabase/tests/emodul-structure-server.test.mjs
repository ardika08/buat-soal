// Verifikasi pemeriksaan struktur e-modul versi server (_shared/emodul-structure.ts).
//
// Aturannya harus sama dengan pratinjau di editor: pesan & tingkat keparahan
// identik, temuan membawa id bab/bagian, dan urutannya error lebih dulu.
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { checkEModulStructure } = await import(
  pathToFileURL(join(root, "supabase", "functions", "_shared", "emodul-structure.ts")).href
);

function buildDraft(patch = {}) {
  return {
    title: "Ekosistem",
    topics: [{ topik: "Ekosistem", capaian: "Menjelaskan komponen ekosistem." }],
    chapters: [
      {
        id: 11,
        order_number: 1,
        title: "Bab 1: Ekosistem",
        sections: [
          {
            id: 101,
            order_number: 1,
            kind: "materi",
            title: "Subbab 1.1: Komponen Ekosistem",
            content: "Isi materi yang cukup panjang untuk lolos pemeriksaan struktur.",
          },
          {
            id: 102,
            order_number: 2,
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
  assert.equal(report.error_count, 0);
});

test("judul modul kosong menjadi error", () => {
  const report = checkEModulStructure(buildDraft({ title: "   " }));

  assert.equal(report.ready, false);
  assert.equal(report.error_count, 1);
  assert.match(report.findings[0].message, /Judul modul/);
});

test("tanpa topik menjadi error", () => {
  const report = checkEModulStructure(buildDraft({ topics: [] }));

  assert.equal(report.ready, false);
  assert.ok(report.findings.some((finding) => /topik pembelajaran/i.test(finding.message)));
});

test("capaian kosong hanya peringatan", () => {
  const report = checkEModulStructure(
    buildDraft({ topics: [{ topik: "Ekosistem", capaian: "" }] }),
  );

  assert.equal(report.ready, true);
  assert.equal(report.warning_count, 1);
  assert.match(report.findings[0].message, /Capaian pembelajaran/);
});

test("bab tanpa subbab materi menjadi error dengan id bab", () => {
  const draft = buildDraft();
  draft.chapters[0].sections = [draft.chapters[0].sections[1]];

  const report = checkEModulStructure(draft);
  const finding = report.findings.find((item) => /subbab materi/i.test(item.message));

  assert.ok(finding);
  assert.equal(finding.severity, "error");
  assert.equal(finding.chapter_id, 11);
});

test("bab tanpa latihan menjadi info", () => {
  const draft = buildDraft();
  draft.chapters[0].sections = [draft.chapters[0].sections[0]];

  const report = checkEModulStructure(draft);
  const finding = report.findings.find((item) => /belum punya latihan/i.test(item.message));

  assert.ok(finding);
  assert.equal(finding.severity, "info");
  assert.equal(report.ready, true);
});

test("isi bagian kosong menjadi peringatan dengan id bagian", () => {
  const draft = buildDraft();
  draft.chapters[0].sections[0].content = "   ";

  const report = checkEModulStructure(draft);
  const finding = report.findings.find((item) => /masih kosong/i.test(item.message));

  assert.ok(finding);
  assert.equal(finding.severity, "warning");
  assert.equal(finding.section_id, 101);
  assert.equal(finding.chapter_id, 11);
});

test("isi terlalu pendek diperingatkan", () => {
  const draft = buildDraft();
  draft.chapters[0].sections[0].content = "pendek";

  const report = checkEModulStructure(draft);

  assert.ok(report.findings.some((finding) => /terlalu pendek/i.test(finding.message)));
});

test("temuan diurutkan error lebih dulu, lalu warning, lalu info", () => {
  const draft = buildDraft({ title: "" });
  draft.chapters[0].sections = [draft.chapters[0].sections[0]];

  const report = checkEModulStructure(draft);

  assert.equal(report.findings[0].severity, "error");
  assert.equal(report.findings[report.findings.length - 1].severity, "info");
});
