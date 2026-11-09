import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ai = readFileSync(new URL("../functions/_shared/ai.ts", import.meta.url), "utf8");
const emodulAi = readFileSync(new URL("../functions/_shared/emodul-ai.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/20260916000000_free_trial_100_credits.sql", import.meta.url), "utf8");

test("akun free memakai OpenAI dan model gratis gpt-4.1-mini", () => {
  assert.match(ai, /: "openai";/);
  assert.equal((ai.match(/Deno\.env\.get\("OPENAI_FREE_MODEL"\) \?\? "gpt-4\.1-mini"/g) ?? []).length, 2);
  assert.match(emodulAi, /Deno\.env\.get\("OPENAI_FREE_MODEL"\) \?\? "gpt-4\.1-mini"/);
});

test("akun baru mendapat saldo dan transaksi bonus 100 kredit", () => {
  assert.match(migration, /credits_balance set default 100/);
  assert.match(migration, /email, credits_balance\)[\s\S]*?100\r?\n  \)/);
  assert.match(migration, /'bonus', 100, 'Kredit gratis selamat datang untuk pengguna baru\.'/);
});
