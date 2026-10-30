// Verifikasi nama berkas ekspor e-modul (src/lib/emodulFilename.ts).
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { emodulExportFilename } = await import(
  pathToFileURL(join(root, "src", "lib", "emodulFilename.ts")).href
);

test("nama berkas PDF dibentuk dari judul", () => {
  assert.equal(
    emodulExportFilename("Ekosistem dan Keseimbangan Lingkungan", "pdf"),
    "ekosistem-dan-keseimbangan-lingkungan.pdf",
  );
});

test("pemisah dijadikan spasi, bukan menempelkan kata", () => {
  assert.equal(
    emodulExportFilename("Modul: IPA/Bab 1 & 2!", "docx"),
    "modul-ipa-bab-1-2.docx",
  );
});

test("judul kosong memakai nama pengganti", () => {
  assert.equal(emodulExportFilename("   ", "pdf"), "e-modul.pdf");
  assert.equal(emodulExportFilename("---", "docx"), "e-modul.docx");
});
