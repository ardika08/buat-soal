// Verifikasi pemetaan respons e-modul (src/lib/emodulMappers.ts).
//
// Pengganti tes data tiruan lama: sekarang yang diuji adalah pemetaan data nyata
// dari Edge Function `emodul-detail`, karena editor & pratinjau memakai hasil
// pemetaan ini langsung. Kalau kolom hilang/berubah, layar tidak boleh menampilkan
// "NaN" atau halaman kosong.
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { normalizeEModulDetail, normalizeEModulSummary, truncateForTitle } = await import(
  pathToFileURL(join(root, "src", "lib", "emodulMappers.ts")).href
);

const rawDetail = {
  e_modul: {
    id: 7,
    title: "Ekosistem",
    subject: "Ilmu Pengetahuan Alam",
    fase: "Fase D",
    kelas: "Kelas 7",
    semester: "Ganjil",
    topics: [{ topik: "Ekosistem", capaian: "Menjelaskan ekosistem." }],
    status: "ready",
    credits_consumed: 8,
    chapters_target: 2,
    sub_chapters_target: 2,
    exercise_share: 50,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
  chapters: [
    {
      id: 100,
      order_number: 1,
      title: "Bab 1: Ekosistem",
      sections: [
        { id: 500, order_number: 1, kind: "materi", title: "Subbab 1.1", content: "Isi materi." },
        { id: 501, order_number: 2, kind: "latihan", title: "Latihan 1.2", content: "Soal." },
      ],
    },
  ],
  summary: { chapters: 1, materi_sections: 1, latihan_sections: 1, total_sections: 2 },
};

test("detail lengkap dipetakan apa adanya dengan tipe angka", () => {
  const detail = normalizeEModulDetail(rawDetail);

  assert.equal(detail.eModul.id, 7);
  assert.equal(detail.eModul.status, "ready");
  assert.equal(detail.chapters.length, 1);
  assert.equal(typeof detail.chapters[0].id, "number");
  assert.equal(detail.chapters[0].sections[1].kind, "latihan");
  assert.equal(detail.summary.total_sections, 2);
});

test("respons kosong menghasilkan nilai pasti, bukan undefined", () => {
  const detail = normalizeEModulDetail({});

  assert.equal(detail.eModul.id, 0);
  assert.equal(detail.eModul.title, "E-Modul Baru");
  assert.equal(detail.eModul.status, "draft");
  assert.deepEqual(detail.chapters, []);
  assert.deepEqual(detail.summary, {
    chapters: 0,
    materi_sections: 0,
    latihan_sections: 0,
    total_sections: 0,
  });
});

test("jenis bagian asing jatuh ke 'materi' (gagal aman)", () => {
  const detail = normalizeEModulDetail({
    chapters: [
      {
        id: "9",
        order_number: "2",
        title: "Bab",
        sections: [{ id: "1", order_number: "1", kind: "??", title: "x", content: "y" }],
      },
    ],
  });

  assert.equal(detail.chapters[0].sections[0].kind, "materi");
  assert.equal(detail.chapters[0].id, 9);
  assert.equal(detail.chapters[0].order, 2);
});

test("ringkasan tak konsisten dihitung ulang dari strukturnya", () => {
  const summary = normalizeEModulSummary(
    { chapters: 1, materi_sections: 5, latihan_sections: 1, total_sections: 99 },
    [
      { sections: [{ kind: "materi" }, { kind: "latihan" }] },
      { sections: [{ kind: "materi" }] },
    ],
  );

  assert.deepEqual(summary, {
    chapters: 2,
    materi_sections: 2,
    latihan_sections: 1,
    total_sections: 3,
  });
});

test("ringkasan konsisten dari server dipakai apa adanya", () => {
  const summary = normalizeEModulSummary(
    { chapters: 1, materi_sections: 1, latihan_sections: 1, total_sections: 2 },
    [],
  );

  assert.equal(summary.total_sections, 2);
});

test("judul panjang dipotong satu baris dengan elipsis", () => {
  const title = truncateForTitle(`  ${"a".repeat(50)}\n  ${"b".repeat(50)}  `, 20);

  assert.ok(title.length <= 20);
  assert.match(title, /…$/);
  assert.doesNotMatch(title, /\n/);
});
