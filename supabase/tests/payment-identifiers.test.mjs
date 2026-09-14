import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const identifiers = await import(pathToFileURL(join(root, "src", "lib", "paymentIdentifiers.ts")).href);

test("nomor invoice memakai awalan INV dan minimal lima digit", () => {
  assert.equal(identifiers.paymentInvoiceNumber(23), "INV00023");
  assert.equal(identifiers.paymentInvoiceNumber(98233), "INV98233");
});

test("nomor transaksi memakai awalan TRX dan ID order yang sama", () => {
  assert.equal(identifiers.paymentTransactionNumber(23), "TRX00023");
  assert.equal(identifiers.paymentTransactionNumber(98233), "TRX98233");
});

test("ID tidak valid jatuh ke nomor aman", () => {
  assert.equal(identifiers.paymentInvoiceNumber(-1), "INV00000");
  assert.equal(identifiers.paymentTransactionNumber(Number.NaN), "TRX00000");
});
