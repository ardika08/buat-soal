import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ai = readFileSync(new URL("../functions/_shared/ai.ts", import.meta.url), "utf8");
const emodulAi = readFileSync(new URL("../functions/_shared/emodul-ai.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/20260916000000_free_trial_100_credits.sql", import.meta.url), "utf8");

test("akun free memakai provider default env AI_FREE_PROVIDER (fallback OpenAI) dan model gpt-4.1-mini", () => {
  assert.match(ai, /AI_FREE_PROVIDER"\) \?\? "openai"/);
  assert.equal((ai.match(/Deno\.env\.get\("OPENAI_FREE_MODEL"\) \?\? "gpt-4\.1-mini"/g) ?? []).length, 2);
  assert.match(emodulAi, /Deno\.env\.get\("OPENAI_FREE_MODEL"\) \?\? "gpt-4\.1-mini"/);
});

test("provider Anthropic tersedia untuk soal, capaian, dan e-modul", () => {
  assert.match(ai, /ANTHROPIC_API_KEY belum dikonfigurasi/);
  assert.match(ai, /Deno\.env\.get\("ANTHROPIC_FREE_MODEL"\) \?\? "claude-haiku-4\.5"/);
  assert.match(ai, /Deno\.env\.get\("ANTHROPIC_PREMIUM_MODEL"\) \?\? "claude-sonnet-4\.5"/);
  assert.match(ai, /capaianWithAnthropic/);
  assert.match(ai, /generateWithAnthropic/);
  assert.match(emodulAi, /withAnthropic/);
  assert.match(emodulAi, /ANTHROPIC_API_KEY belum dikonfigurasi/);
});

test("akun baru mendapat saldo dan transaksi bonus 100 kredit", () => {
  assert.match(migration, /credits_balance set default 100/);
  assert.match(migration, /email, credits_balance\)[\s\S]*?100\r?\n  \)/);
  assert.match(migration, /'bonus', 100, 'Kredit gratis selamat datang untuk pengguna baru\.'/);
});
