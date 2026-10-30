// Verifikasi ringkasan isi e-modul (_shared/emodul-summary.ts).
//
// Ringkasan ini dipakai endpoint detail editor; angkanya harus konsisten dengan
// struktur tersimpan (bab, subbab materi, latihan).
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { summarizeEModul } = await import(
  pathToFileURL(join(root, "supabase", "functions", "_shared", "emodul-summary.ts")).href
);

test("menghitung bab, subbab materi, dan latihan", () => {
  const summary = summarizeEModul([
    { sections: [{ kind: "materi" }, { kind: "latihan" }] },
    { sections: [{ kind: "materi" }, { kind: "materi" }] },
  ]);

  assert.deepEqual(summary, {
    chapters: 2,
    materi_sections: 3,
    latihan_sections: 1,
    total_sections: 4,
  });
});

test("modul kosong menghasilkan nol", () => {
  assert.deepEqual(summarizeEModul([]), {
    chapters: 0,
    materi_sections: 0,
    latihan_sections: 0,
    total_sections: 0,
  });
});

test("bab tanpa bagian tetap dihitung babnya", () => {
  const summary = summarizeEModul([{ sections: [] }, { sections: [{ kind: "latihan" }] }]);

  assert.equal(summary.chapters, 2);
  assert.equal(summary.materi_sections, 0);
  assert.equal(summary.latihan_sections, 1);
  assert.equal(summary.total_sections, 1);
});
