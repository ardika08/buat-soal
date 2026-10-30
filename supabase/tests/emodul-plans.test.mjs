// Verifikasi detail paket + manfaat E-Book (_shared/ebook-plans.ts).
//
// Jalankan: npm test

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const functionsDir = join(root, "supabase", "functions", "_shared");

const { buildEbookPlans, EBOOK_BENEFITS, FREE_EBOOK_PLAN } = await import(
  pathToFileURL(join(functionsDir, "ebook-plans.ts")).href
);
const { billingPackages } = await import(
  pathToFileURL(join(functionsDir, "billing.ts")).href
);

test("daftar paket dimulai dari Paket Dasar lalu paket premium", () => {
  const plans = buildEbookPlans();

  assert.equal(plans[0].id, "free");
  assert.deepEqual(
    plans.slice(1).map((plan) => plan.id),
    Object.keys(billingPackages),
  );
});

test("Paket Dasar tidak menyertakan E-Book", () => {
  const free = buildEbookPlans()[0];

  assert.equal(free.ebook_included, false);
  assert.equal(free.tier, "free");
  assert.deepEqual(free.benefits, []);
  assert.deepEqual(free, FREE_EBOOK_PLAN);
});

test("paket premium menyertakan seluruh manfaat E-Book", () => {
  const [, premium] = buildEbookPlans();

  assert.equal(premium.ebook_included, true);
  assert.equal(premium.tier, "premium");
  assert.deepEqual(premium.benefits, EBOOK_BENEFITS);
  assert.equal(premium.benefits.length, 5);
});

test("harga/kredit/durasi mengikuti definisi billing server", () => {
  const plans = buildEbookPlans();

  for (const [id, serverPlan] of Object.entries(billingPackages)) {
    const plan = plans.find((item) => item.id === id);

    assert.ok(plan, `paket ${id} tidak ada`);
    assert.equal(plan.price, serverPlan.price);
    assert.equal(plan.credits, serverPlan.credits);
    assert.equal(plan.duration_months, serverPlan.duration_months);
    assert.equal(plan.name, serverPlan.name);
  }
});

test("manfaat E-Book memakai kunci unik", () => {
  const keys = EBOOK_BENEFITS.map((benefit) => benefit.key);

  assert.equal(new Set(keys).size, keys.length);
});
