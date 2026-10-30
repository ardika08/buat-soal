// Verifikasi hak akses unduh E-Book (_shared/entitlement.ts).
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const { resolveEbookEntitlement, buildEbookAccessResponse } = await import(
  pathToFileURL(join(root, "supabase", "functions", "_shared", "entitlement.ts")).href
);

const NOW = Date.parse("2026-01-01T00:00:00Z");

test("premium tanpa tanggal kedaluwarsa berhak selamanya", () => {
  const result = resolveEbookEntitlement({ subscription_tier: "premium", subscription_expiry: null }, NOW);

  assert.equal(result.entitled, true);
  assert.equal(result.tier, "premium");
  assert.equal(result.expires_at, null);
  assert.equal(result.reason, "active_subscription");
});

test("premium dengan tanggal masa depan berhak", () => {
  const result = resolveEbookEntitlement(
    { subscription_tier: "premium", subscription_expiry: "2026-06-01T00:00:00Z" },
    NOW,
  );

  assert.equal(result.entitled, true);
  assert.equal(result.expires_at, "2026-06-01T00:00:00Z");
});

test("premium kedaluwarsa tidak berhak meski tier masih premium", () => {
  const result = resolveEbookEntitlement(
    { subscription_tier: "premium", subscription_expiry: "2025-06-01T00:00:00Z" },
    NOW,
  );

  assert.equal(result.entitled, false);
  assert.equal(result.tier, "premium");
  assert.equal(result.reason, "upgrade_required");
});

test("pengguna free tidak berhak", () => {
  const result = resolveEbookEntitlement({ subscription_tier: "free", subscription_expiry: null }, NOW);

  assert.equal(result.entitled, false);
  assert.equal(result.tier, "free");
  assert.equal(result.reason, "upgrade_required");
});

test("tier tak dikenal diperlakukan sebagai free (fail-safe)", () => {
  for (const tier of ["basic", "gold", "", null, undefined, 5]) {
    const result = resolveEbookEntitlement({ subscription_tier: tier }, NOW);

    assert.equal(result.entitled, false, `tier ${JSON.stringify(tier)} harus tidak berhak`);
    assert.equal(result.tier, "free");
  }
});

test("tanggal kedaluwarsa tidak valid tidak memberi akses", () => {
  const result = resolveEbookEntitlement(
    { subscription_tier: "premium", subscription_expiry: "bukan-tanggal" },
    NOW,
  );

  assert.equal(result.entitled, false);
});

// --- Bentuk respons pemeriksaan akses ---

test("respons berhak menyertakan manfaat E-Book", () => {
  const response = buildEbookAccessResponse({ entitled: true, tier: "premium", expires_at: null, reason: "active_subscription" });

  assert.equal(response.upgrade_required, false);
  assert.equal(response.benefits.length, 5);
  assert.equal(response.benefits[0].key, "akses_emodul");
});

test("respons belum berhak tanpa manfaat dan menyalakan upgrade_required", () => {
  const response = buildEbookAccessResponse({ entitled: false, tier: "free", expires_at: null, reason: "upgrade_required" });

  assert.equal(response.upgrade_required, true);
  assert.deepEqual(response.benefits, []);
});