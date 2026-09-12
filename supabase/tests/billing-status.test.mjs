// Verifikasi gerbang keputusan pembayaran.
//
// `mapProviderStatus` adalah satu-satunya tempat status dari Mayar diterjemahkan menjadi
// keputusan "boleh memberi benefit atau tidak". Peta ini sengaja dibuat ketat: hanya
// status yang benar-benar berarti LUNAS yang boleh menjadi 'paid'. Apa pun yang tidak
// dikenali HARUS jatuh ke 'pending' (aman: tidak ada kredit yang diberikan).
//
// Jalankan: npm run test:billing

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

// Node >= 23 bisa mengimpor .ts langsung (type stripping). Specifier harus berupa URL
// (bukan path Windows) supaya loader ESM mau menyelesaikannya.
async function loadBilling() {
  const module = await import(pathToFileURL(join(root, "supabase", "functions", "_shared", "billing.ts")).href);
  if (typeof module.mapProviderStatus !== "function") {
    throw new Error("mapProviderStatus tidak ditemukan — periksa supabase/functions/_shared/billing.ts.");
  }
  return { mapProviderStatus: module.mapProviderStatus, findPackage: module.findPackage, billingPackages: module.billingPackages, INVOICE_TTL_MINUTES: module.INVOICE_TTL_MINUTES };
}

const { mapProviderStatus, billingPackages, INVOICE_TTL_MINUTES } = await loadBilling();

test("hanya status lunas yang dianggap paid", () => {
  for (const status of ["paid", "PAID", "Paid", "success", "settled"]) {
    assert.equal(mapProviderStatus(status), "paid", `status "${status}" harus paid`);
  }
});

test("status belum bayar tidak pernah dianggap paid", () => {
  for (const status of ["unpaid", "pending", "waiting", "created", "", null, undefined]) {
    assert.equal(mapProviderStatus(status), "pending", `status "${status}" harus pending`);
  }
});

test("status akhir lain dipetakan tanpa memberi benefit", () => {
  assert.equal(mapProviderStatus("expired"), "expired");
  assert.equal(mapProviderStatus("failed"), "failed");
  for (const status of ["cancelled", "canceled", "closed"]) {
    assert.equal(mapProviderStatus(status), "cancelled");
  }
});

test("status tak dikenal jatuh ke pending (fail-safe)", () => {
  // String aneh dari payload/webhook tidak boleh membuat sistem memberi kredit.
  for (const status of ["lunas", "refunded", "chargeback", "verifikasi", "1", "true", "paid-off"]) {
    assert.equal(mapProviderStatus(status), "pending", `status tak dikenal "${status}" harus pending`);
  }
});

test("spasi/newline di sekeliling status dinormalisasi", () => {
  // Provider kadang mengirim "paid\n" atau " Paid ". Ini harus tetap dianggap lunas,
  // kalau tidak pembayaran sah akan gagal dipenuhi.
  for (const status of [" paid ", "paid\n", "\tPAID\t", "Success "]) {
    assert.equal(mapProviderStatus(status), "paid", `status "${JSON.stringify(status)}" harus paid`);
  }
});

test("daftar paket server tidak boleh menyimpang dari yang ditampilkan klien", () => {
  // Harga & kredit dipakai server untuk membuat invoice, jadi definisi di server adalah
  // otoritasnya. Klien punya salinan sendiri untuk menampilkan harga; kalau keduanya
  // berbeda, pengguna melihat harga A tetapi ditagih harga B.
  const clientSource = readFileSync(join(root, "src", "lib", "api.ts"), "utf8");
  const block = clientSource.slice(clientSource.indexOf("const billingPackages"));

  for (const [id, serverPackage] of Object.entries(billingPackages)) {
    const entryStart = block.indexOf(`id: "${id}"`);
    assert.notEqual(entryStart, -1, `paket ${id} tidak ada di src/lib/api.ts`);

    const entry = block.slice(entryStart, block.indexOf("},", entryStart));
    assert.match(entry, new RegExp(`credits: ${serverPackage.credits}\\b`), `kredit ${id} berbeda`);
    assert.match(entry, new RegExp(`price: ${serverPackage.price}\\b`), `harga ${id} berbeda`);

    const months = serverPackage.duration_months;
    assert.match(
      entry,
      new RegExp(`duration_months: ${months === null ? "null" : months}\\b`),
      `durasi ${id} berbeda`,
    );
  }
});

test("TTL invoice server & SQL tidak boleh menyimpang", () => {
  // Server memakai INVOICE_TTL_MINUTES untuk masa berlaku invoice; SQL memakai nilainya
  // sebagai default saat menyapu order menggantung. Kalau keduanya berbeda, order bisa
  // dianggap kedaluwarsa oleh database padahal invoice Mayar masih hidup.
  const migration = readFileSync(
    join(root, "supabase", "migrations", "20260912010000_p1_billing_lifecycle.sql"),
    "utf8",
  );

  const match = migration.match(/expire_stale_payment_orders\(p_ttl_minutes integer default (\d+)\)/);
  assert.ok(match, "default TTL tidak ditemukan di migration P1");
  assert.equal(
    Number(match[1]),
    INVOICE_TTL_MINUTES,
    "default TTL di migration harus sama dengan INVOICE_TTL_MINUTES",
  );
});
