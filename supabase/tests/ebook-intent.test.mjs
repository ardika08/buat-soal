// Verifikasi alur resume upgrade E-Book (src/lib/ebookUpgradeIntent.ts).
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { isResumableIntent, loadEbookUpgradeIntent } = await import(
  pathToFileURL(join(root, "src", "lib", "ebookUpgradeIntent.ts")).href
);

function intent(returnTo) {
  return { return_to: returnTo, action: "download_pdf", created_at: "2026-01-01T00:00:00Z" };
}

test("niat bisa dilanjutkan di halaman yang sama", () => {
  assert.equal(
    isResumableIntent(intent("/e-modul/draf-1/pratinjau"), "/e-modul/draf-1/pratinjau"),
    true,
  );
});

test("query string pada halaman asal diabaikan", () => {
  assert.equal(
    isResumableIntent(intent("/e-modul/draf-1/pratinjau?from=editor"), "/e-modul/draf-1/pratinjau"),
    true,
  );
});

test("halaman berbeda tidak boleh melanjutkan niat", () => {
  assert.equal(
    isResumableIntent(intent("/e-modul/draf-1/pratinjau"), "/e-modul/draf-2/pratinjau"),
    false,
  );
});

test("niat kosong/tidak valid tidak bisa dilanjutkan", () => {
  assert.equal(isResumableIntent(null, "/e-modul/draf-1/pratinjau"), false);
  assert.equal(isResumableIntent(intent(""), "/e-modul/draf-1/pratinjau"), false);
});

test("di luar browser tidak ada niat tersimpan", () => {
  assert.equal(loadEbookUpgradeIntent(), null);
});
