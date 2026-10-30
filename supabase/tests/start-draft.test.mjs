// Verifikasi titik masuk draf baru.
//
// `resolveStartTarget` memetakan jenis draf ke alamat halaman mulai. Uji ini
// memastikan jenis tak dikenal ditolak (bukan diam-diam jadi "exam") dan setiap
// jenis punya alamat yang benar.
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
async function loadStart() {
  const module = await import(pathToFileURL(join(root, "supabase", "functions", "_shared", "start.ts")).href);
  if (typeof module.resolveStartTarget !== "function") {
    throw new Error("resolveStartTarget tidak ditemukan — periksa supabase/functions/_shared/start.ts.");
  }
  return { resolveStartTarget: module.resolveStartTarget, isDraftType: module.isDraftType };
}

const { resolveStartTarget, isDraftType } = await loadStart();

test("hanya jenis draf yang dikenal yang lolos", () => {
  assert.equal(isDraftType("exam"), true);
  assert.equal(isDraftType("e_modul"), true);
  for (const value of ["", "EXAM", "emodul", "soal", null, undefined, 1, {}]) {
    assert.equal(isDraftType(value), false, `jenis ${JSON.stringify(value)} harus ditolak`);
  }
});

test("setiap jenis draf punya alamat halaman mulai", () => {
  assert.deepEqual(resolveStartTarget("exam"), { type: "exam", redirect_url: "/generate" });
  assert.deepEqual(resolveStartTarget("e_modul"), { type: "e_modul", redirect_url: "/e-modul/baru" });
});

test("alamat selalu berupa path absolut", () => {
  for (const type of ["exam", "e_modul"]) {
    assert.match(resolveStartTarget(type).redirect_url, /^\//);
  }
});
