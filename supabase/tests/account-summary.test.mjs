// Verifikasi ringkasan kredit & paket akun.
//
// `buildAccountSummary` adalah satu-satunya tempat baris profil diubah menjadi
// ringkasan yang dilihat klien. Uji ini memastikan nilai asing gagal ke arah aman
// (tier tak dikenal -> free) dan status langganan hanya aktif bila benar-benar berlaku.
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

// Node >= 23 bisa mengimpor .ts langsung (type stripping). Specifier harus berupa URL
// (bukan path Windows) supaya loader ESM mau menyelesaikannya.
async function loadAccount() {
  const module = await import(pathToFileURL(join(root, "supabase", "functions", "_shared", "account.ts")).href);
  if (typeof module.buildAccountSummary !== "function") {
    throw new Error("buildAccountSummary tidak ditemukan — periksa supabase/functions/_shared/account.ts.");
  }
  return { buildAccountSummary: module.buildAccountSummary, isSubscriptionActive: module.isSubscriptionActive };
}

const { buildAccountSummary, isSubscriptionActive } = await loadAccount();

test("memetakan baris profil menjadi ringkasan akun", () => {
  const summary = buildAccountSummary(
    {
      id: 7,
      name: "Bu Rina",
      email: "rina@example.com",
      credits_balance: 12,
      subscription_tier: "premium",
      subscription_expiry: "2999-01-01T00:00:00.000Z",
    },
    { hasPurchasedCredits: true },
  );

  assert.equal(summary.id, 7);
  assert.equal(summary.name, "Bu Rina");
  assert.equal(summary.email, "rina@example.com");
  assert.equal(summary.credits_balance, 12);
  assert.equal(summary.subscription_tier, "premium");
  assert.equal(summary.subscription_expiry, "2999-01-01T00:00:00.000Z");
  assert.equal(summary.has_purchased_credits, true);
  assert.equal(summary.subscription_active, true);
});

test("tier tak dikenal diperlakukan sebagai free (fail-safe)", () => {
  for (const tier of ["basic", "gold", "", null, undefined, "PREMIUM", 5]) {
    const summary = buildAccountSummary({ id: 1, subscription_tier: tier });
    assert.equal(summary.subscription_tier, "free", `tier ${JSON.stringify(tier)} harus free`);
    assert.equal(summary.subscription_active, false);
  }
});

test("nilai hilang menghasilkan default yang pasti, bukan undefined", () => {
  const summary = buildAccountSummary({});
  assert.equal(summary.id, 0);
  assert.equal(summary.name, "");
  assert.equal(summary.email, "");
  assert.equal(summary.credits_balance, 0);
  assert.equal(summary.subscription_expiry, null);
  assert.equal(summary.has_purchased_credits, false);
});

test("has_purchased_credits hanya true bila eksplisit", () => {
  assert.equal(buildAccountSummary({}, { hasPurchasedCredits: true }).has_purchased_credits, true);
  assert.equal(buildAccountSummary({}, { hasPurchasedCredits: false }).has_purchased_credits, false);
  assert.equal(buildAccountSummary({}).has_purchased_credits, false);
});

test("langganan premium aktif hanya bila masa berlaku belum lewat", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(isSubscriptionActive("premium", "2026-06-01T00:00:00.000Z", now), true);
  assert.equal(isSubscriptionActive("premium", "2025-06-01T00:00:00.000Z", now), false);
  assert.equal(isSubscriptionActive("premium", null, now), true);
  assert.equal(isSubscriptionActive("free", null, now), false);
  assert.equal(isSubscriptionActive("premium", "bukan-tanggal", now), false);
});
