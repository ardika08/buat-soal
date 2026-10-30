// Verifikasi identitas sekolah untuk kop dokumen (src/lib/schoolLetterhead.ts).
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { hasSchoolLetterhead, loadSchoolLetterhead, EMPTY_SCHOOL_LETTERHEAD } = await import(
  pathToFileURL(join(root, "src", "lib", "schoolLetterhead.ts")).href
);

test("kop dianggap terisi hanya bila nama sekolah diisi", () => {
  assert.equal(hasSchoolLetterhead({ ...EMPTY_SCHOOL_LETTERHEAD }), false);
  assert.equal(
    hasSchoolLetterhead({ ...EMPTY_SCHOOL_LETTERHEAD, school_name: "   " }),
    false,
  );
  assert.equal(
    hasSchoolLetterhead({ ...EMPTY_SCHOOL_LETTERHEAD, school_name: "SMP Negeri 1" }),
    true,
  );
});

test("di luar browser (tanpa localStorage) memuat kop kosong", () => {
  assert.deepEqual(loadSchoolLetterhead(), EMPTY_SCHOOL_LETTERHEAD);
});
