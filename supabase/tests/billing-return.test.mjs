// Verifikasi logika alur kembali dari pembayaran.
//
// Setelah membayar di Mayar, pengguna diarahkan kembali ke aplikasi. Halaman itu harus
// tahu ORDER MANA yang sedang diperiksa — kalau salah tebak, pengguna melihat status
// pembayaran orang lain atau status order yang sudah lama. Fungsi di sini murni, sehingga
// bisa diuji tanpa browser.
//
// Jalankan: npm run test:billing-return

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

async function load(relativePath) {
  const modulePath = join(root, relativePath);
  return import(pathToFileURL(modulePath).href);
}

const returnModule = await load(join("src", "lib", "billingReturn.ts"));
const billingModule = await load(join("supabase", "functions", "_shared", "billing.ts"));

const { resolveOrderId, shouldKeepPolling, describeOutcome } = returnModule;
const { buildBillingReturnUrl, shouldReconcileOrder } = billingModule;

test("resolveOrderId membaca order id dari query string", () => {
  assert.equal(resolveOrderId("?order_id=42", null), 42);
  assert.equal(resolveOrderId("?orderId=42", null), 42);
  assert.equal(resolveOrderId("order_id=42", null), 42);
});

test("resolveOrderId mengabaikan query yang tidak berisi order id yang sah", () => {
  for (const search of ["", "?", "?foo=bar", "?order_id=", "?order_id=abc", "?order_id=0", "?order_id=-5", "?order_id=1.5"]) {
    assert.equal(resolveOrderId(search, null), null, `query "${search}" tidak boleh menghasilkan order id`);
  }
});

test("resolveOrderId jatuh ke order terakhir yang disimpan browser", () => {
  // Mayar tidak selalu mengembalikan parameter tambahan kita, jadi order terakhir
  // yang dibuat klien dipakai sebagai cadangan.
  assert.equal(resolveOrderId("", "42"), 42);
  assert.equal(resolveOrderId("?foo=bar", "42"), 42);
  assert.equal(resolveOrderId("?order_id=7", "42"), 7, "query string menang atas nilai tersimpan");
  assert.equal(resolveOrderId("", "bukan-angka"), null);
});

test("shouldKeepPolling berhenti pada status akhir", () => {
  for (const status of ["paid", "expired", "failed", "cancelled"]) {
    assert.equal(shouldKeepPolling(status, 1, 10), false, `status ${status} adalah status akhir`);
  }
});

test("shouldKeepPolling melanjutkan selama status belum final dan batas belum tercapai", () => {
  assert.equal(shouldKeepPolling("pending", 1, 10), true);
  assert.equal(shouldKeepPolling("pending", 9, 10), true);
  assert.equal(shouldKeepPolling("pending", 10, 10), false, "berhenti setelah batas percobaan");
  assert.equal(shouldKeepPolling("pending", 11, 10), false);
});

test("describeOutcome memberi pesan yang sesuai untuk tiap status", () => {
  assert.match(describeOutcome("paid").message, /berhasil/i);
  assert.equal(describeOutcome("paid").tone, "success");
  assert.equal(describeOutcome("pending").tone, "pending");
  assert.equal(describeOutcome("expired").tone, "failed");
  assert.equal(describeOutcome("failed").tone, "failed");
  assert.equal(describeOutcome("cancelled").tone, "failed");
  assert.equal(describeOutcome("entah-apa").tone, "pending", "status tak dikenal tidak boleh dianggap gagal");
});

test("URL kembali dari pembayaran membawa order id", () => {
  // Tanpa order id, halaman kembali tidak tahu order mana yang harus diperiksa sehingga
  // kredit pengguna tidak pernah dikonfirmasi.
  assert.equal(
    buildBillingReturnUrl("https://soalify.app", 42),
    "https://soalify.app/billing/return?order_id=42",
  );
});

test("URL kembali menormalkan base URL yang punya garis miring di akhir", () => {
  assert.equal(
    buildBillingReturnUrl("https://soalify.app/", 7),
    "https://soalify.app/billing/return?order_id=7",
  );
});

// --- Kapan order masih perlu ditanya ulang ke Mayar (pengaman uang pengguna) ---

test("order pending dengan invoice tetap direkonsiliasi", () => {
  assert.equal(shouldReconcileOrder("pending", "inv-1"), true);
});

test("order expired tetap direkonsiliasi karena pembayaran bisa masuk di menit terakhir", () => {
  // Ini penyebab nyata kredit hilang: sapu TTL mengubah status jadi expired, padahal
  // pengguna sudah membayar. Kalau dilewati, uangnya masuk tapi kredit tidak pernah turun.
  assert.equal(shouldReconcileOrder("expired", "inv-1"), true);
});

test("order yang sudah lunas atau gagal tidak direkonsiliasi lagi", () => {
  for (const status of ["paid", "failed", "cancelled"]) {
    assert.equal(shouldReconcileOrder(status, "inv-1"), false, `status ${status} sudah final`);
  }
});

test("order tanpa invoice tidak pernah direkonsiliasi", () => {
  assert.equal(shouldReconcileOrder("pending", null), false);
  assert.equal(shouldReconcileOrder("pending", ""), false);
  assert.equal(shouldReconcileOrder("expired", undefined), false);
});
