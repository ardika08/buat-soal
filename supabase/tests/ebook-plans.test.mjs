// Verifikasi perbandingan batasan E-Book antar paket (src/lib/ebookPlans.ts).
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { buildEbookComparison } = await import(
  pathToFileURL(join(root, "src", "lib", "ebookPlans.ts")).href
);

const packages = [
  { name: "Premium 6 Bulan", credits: 1000, duration_months: 6 },
  { name: "Premium 12 Bulan", credits: 2500, duration_months: 12 },
];

test("kolom dimulai dari Paket Dasar lalu tiap paket premium", () => {
  const comparison = buildEbookComparison(packages);

  assert.deepEqual(comparison.columns, [
    "Paket Dasar",
    "Premium 6 Bulan",
    "Premium 12 Bulan",
  ]);
});

test("fitur E-Book silang di Dasar dan centang di Premium", () => {
  const comparison = buildEbookComparison(packages);
  const row = comparison.rows.find((item) => item.label === "Akses E-Modul & bahan ajar");

  assert.deepEqual(row.cells, [{ kind: "cross" }, { kind: "check" }, { kind: "check" }]);
});

test("batas unduhan tanpa batas untuk premium, kosong untuk dasar", () => {
  const comparison = buildEbookComparison(packages);
  const row = comparison.rows.find((item) => item.label === "Batas unduhan");

  assert.deepEqual(row.cells, [
    { kind: "text", text: "—" },
    { kind: "text", text: "Tanpa batas" },
    { kind: "text", text: "Tanpa batas" },
  ]);
});

test("masa akses dan kredit mengikuti paket", () => {
  const comparison = buildEbookComparison(packages);
  const duration = comparison.rows.find((item) => item.label === "Masa akses");
  const credits = comparison.rows.find((item) => item.label === "Kredit disertakan");

  assert.deepEqual(duration.cells.map((cell) => cell.text), ["—", "6 bulan", "12 bulan"]);
  assert.deepEqual(credits.cells.map((cell) => cell.text), [
    "10 (bonus awal)",
    "1.000 kredit",
    "2.500 kredit",
  ]);
});

test("paket tanpa tanggal kedaluwarsa dianggap selamanya", () => {
  const comparison = buildEbookComparison([
    { name: "Premium Tetap", credits: 500, duration_months: null },
  ]);
  const duration = comparison.rows.find((item) => item.label === "Masa akses");

  assert.equal(duration.cells[1].text, "Selamanya");
});
