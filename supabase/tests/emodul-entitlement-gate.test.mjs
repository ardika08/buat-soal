// Memastikan pemeriksaan entitlement E-Book terpasang di alur server.
//
// Gate di klien mudah dilewati; endpoint E-Book harus menolak sendiri saat
// pengguna tidak berhak. Uji ini membaca sumber Edge Function agar gerbangnya
// tidak hilang tanpa sengaja.
//
// Jalankan: npm test

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function source(file) {
  return readFileSync(join(root, "supabase", "functions", file), "utf8");
}

const gatedFlows = [
  "emodul-generate/index.ts",
  "emodul-regenerate/index.ts",
  "emodul-export/index.ts",
];

test("alur menyusun, regenerasi, dan mengunduh memeriksa entitlement", () => {
  for (const file of gatedFlows) {
    const content = source(file);

    assert.match(content, /resolveEbookEntitlement/, `${file} tidak memeriksa entitlement`);
    assert.match(content, /upgrade_required/, `${file} tidak menolak pengguna tanpa hak`);
  }
});

test("endpoint ekspor membaca status langganan dari profil", () => {
  const content = source("emodul-export/index.ts");

  assert.match(content, /subscription_tier/);
  assert.match(content, /subscription_expiry/);
});
