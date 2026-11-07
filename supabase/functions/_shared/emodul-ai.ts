/**
 * Pemanggilan AI untuk e-modul — pola yang sama dengan `_shared/ai.ts`.
 *
 * Provider dipilih dari profil (premium → OpenAI, selain itu Gemini). Keluaran
 * mentah dinormalisasi lewat kontrak murni di `emodul-schema.ts`; percobaan
 * diulang sekali bila output tidak bisa dipakai.
 */

import type { Profile } from "./ai.ts";
import { selectAiProvider } from "./ai.ts";
import {
  buildEModulPrompt,
  buildRegenerateSectionPrompt,
  emodulSchema,
  normalizeEModulOutput,
  normalizeRegeneratedSection,
  regenerateSectionSchema,
  validateEModulCompleteness,
  type EModulOutput,
  type GenerateEModulPayload,
  type RegenerateSectionInput,
} from "./emodul-schema.ts";

export async function generateEModul(
  profile: Profile,
  payload: GenerateEModulPayload,
): Promise<EModulOutput> {
  const provider = selectAiProvider(profile);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callProvider(
        provider,
        buildEModulPrompt(payload),
        emodulSchema(),
        "emodul_structure",
      );
      const output = normalizeEModulOutput(raw, payload);
      const completeness = validateEModulCompleteness(output, payload);

      if (!completeness.ok) {
        throw new Error(completeness.reason ?? "Output AI tidak lengkap.");
      }

      return output;
    } catch (error) {
      lastError = error;
      console.error(`[emodul-ai] Percobaan ${attempt + 1} gagal:`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Output AI tidak valid.");
}

/** Tulis ulang isi satu bagian (judul tidak diubah). */
export async function regenerateEModulSection(
  profile: Profile,
  input: RegenerateSectionInput,
): Promise<string> {
  const provider = selectAiProvider(profile);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callProvider(
        provider,
        buildRegenerateSectionPrompt(input),
        regenerateSectionSchema(),
        "emodul_section",
      );
      return normalizeRegeneratedSection(raw);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Output AI tidak valid.");
}

function callProvider(provider: string, prompt: string, schema: unknown, schemaName: string) {
  return provider === "openai"
    ? withOpenAi(prompt, schema, schemaName)
    : withGemini(prompt, schema);
}

async function withGemini(prompt: string, schema: unknown) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";
  const baseUrl = (Deno.env.get("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta")
    .replace(/\/$/, "");

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi di Supabase Function Secrets.");
  }

  const response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API mengembalikan error (HTTP ${response.status}). ${body}`);
  }

  const json = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("Gemini API tidak mengembalikan teks JSON.");
  }

  return JSON.parse(text);
}

async function withOpenAi(prompt: string, schema: unknown, schemaName: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_PREMIUM_MODEL") ?? "gpt-5.4-mini";
  const baseUrl = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY belum dikonfigurasi di Supabase Function Secrets.");
  }

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      input: [
        {
          role: "system",
          content: "Anda adalah penyusun e-modul/bahan ajar. Jawab hanya dengan JSON sesuai schema.",
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API mengembalikan error (HTTP ${response.status}). ${body}`);
  }

  const json = await response.json();
  const text = extractOpenAiText(json);

  if (!text) {
    throw new Error("OpenAI API tidak mengembalikan teks JSON.");
  }

  return JSON.parse(text);
}

function extractOpenAiText(payload: unknown) {
  const data = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (typeof data.output_text === "string" && data.output_text.trim() !== "") {
    return data.output_text;
  }

  for (const output of data.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string" && content.text.trim() !== "") {
        return content.text;
      }
    }
  }

  return null;
}
