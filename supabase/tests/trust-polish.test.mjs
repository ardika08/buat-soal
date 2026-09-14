import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function source(path) {
  return readFileSync(join(root, path), "utf8");
}

test("Fase D menyediakan kelas 7, 8, dan 9", () => {
  assert.match(source("src/pages/GenerateExam.tsx"), /"Fase D": \[7, 8, 9\]/);
});

test("widget bukti pembelian tidak memiliki daftar transaksi fiktif", () => {
  const widget = source("src/components/marketing/SalesProofWidget.tsx");
  assert.doesNotMatch(widget, /SALES_PROOF_ENTRIES/);
  assert.match(widget, /marketingApi\.salesProof\(\)/);
  assert.match(widget, /Terverifikasi/);
});

test("endpoint bukti pembelian hanya membaca order paid dan menyamarkan nama", () => {
  const endpoint = source("supabase/functions/sales-proof/index.ts");
  assert.match(endpoint, /\.eq\("status", "paid"\)/);
  assert.match(endpoint, /anonymizeName\(order\.customer_name\)/);
  assert.match(endpoint, /\.select\("customer_name, order_type, package_snapshot, credits, paid_at, fulfilled_at"\)/);
  assert.doesNotMatch(endpoint, /\.select\("\*"\)/);
});

test("generate memvalidasi referensi dan format sebelum meminta AI", () => {
  const generate = source("src/pages/GenerateExam.tsx");
  assert.match(generate, /File PDF materi wajib dipilih/);
  assert.match(generate, /Teks materi wajib diisi/);
  assert.match(generate, /Aktifkan minimal satu format soal/);
  assert.match(generate, /Jumlah soal harus antara 1 dan 100/);
});
