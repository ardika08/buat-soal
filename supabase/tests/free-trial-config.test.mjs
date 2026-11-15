import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractValidQuestions, expectedTypesFromFormats, formatsFromExpectedTypes, parseJsonResponse } from "../functions/_shared/ai.ts";

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

test("extractValidQuestions memotong kelebihan soal dan menerima batch parsial untuk top-up", () => {
  const expected = expectedTypesFromFormats([
    { id: "pg", label: "Pilihan Ganda", count: 2 },
    { id: "isian", label: "Isian Singkat", count: 1 },
  ]);

  const makePg = (no) => ({
    question_type: "PG",
    cognitive_level: "C1 - Mengingat",
    difficulty: "Mudah",
    question_content: `Soal ${no}?`,
    options: { A: "Satu", B: "Dua", C: "Tiga" },
    correct_answer: "A",
    illustration_prompt: null,
  });

  const makeIsian = (no) => ({
    question_type: "Isian",
    cognitive_level: "C2 - Memahami",
    difficulty: "Sedang",
    question_content: `Isian ${no}`,
    options: null,
    correct_answer: "Jawab",
    illustration_prompt: null,
  });

  const overGenerated = extractValidQuestions(
    { questions: [makePg(1), makePg(2), makeIsian(3), makeIsian(4), makeIsian(5)] },
    expected,
  );
  assert.equal(overGenerated.length, 3);
  assert.equal(overGenerated[0].question_type, "Pilihan Ganda");
  assert.equal(overGenerated[2].question_type, "Isian Singkat");

  const underGenerated = extractValidQuestions(
    { questions: [makePg(1), makePg(2)] },
    expected,
  );
  assert.equal(underGenerated.length, 2);

  const remainingFormats = formatsFromExpectedTypes(expected.slice(underGenerated.length));
  assert.deepEqual(remainingFormats, [{ id: "isian", label: "Isian Singkat", count: 1 }]);
});

test("parseJsonResponse membersihkan markdown code fence dari output AI", () => {
  const parsed = parseJsonResponse('```json\n{"questions":[{"question_content":"Halo"}]}\n```');
  assert.deepEqual(parsed, { questions: [{ question_content: "Halo" }] });
});
