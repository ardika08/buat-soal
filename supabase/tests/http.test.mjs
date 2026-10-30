// Verifikasi pembacaan token dari header Authorization.
//
// `bearerToken` dipakai endpoint keluar untuk mencabut sesi; kalau salah membaca
// header, sesi yang seharusnya dicabut bisa lolos. Uji ini memastikan hanya format
// "Bearer <token>" yang diterima.
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
async function loadHttp() {
  const module = await import(pathToFileURL(join(root, "supabase", "functions", "_shared", "http.ts")).href);
  if (typeof module.bearerToken !== "function") {
    throw new Error("bearerToken tidak ditemukan — periksa supabase/functions/_shared/http.ts.");
  }
  return module;
}

const { bearerToken } = await loadHttp();

function requestWith(header) {
  return new Request("https://example.test/", {
    headers: header === undefined ? {} : { Authorization: header },
  });
}

test("mengambil token dari header Bearer", () => {
  assert.equal(bearerToken(requestWith("Bearer abc.def.ghi")), "abc.def.ghi");
  assert.equal(bearerToken(requestWith("bearer token123")), "token123");
  assert.equal(bearerToken(requestWith("  Bearer   spaced  ")), "spaced");
});

test("header kosong atau bukan Bearer menghasilkan null", () => {
  assert.equal(bearerToken(requestWith(undefined)), null);
  assert.equal(bearerToken(requestWith("")), null);
  assert.equal(bearerToken(requestWith("Basic abc")), null);
  assert.equal(bearerToken(requestWith("Bearer")), null);
  assert.equal(bearerToken(requestWith("Bearer   ")), null);
});
