export interface GenerateExamPayload {
  curriculum: string;
  exam_type: string;
  class_phase: string;
  subject: string;
  semester: string;
  time_allocation: number;
  reference_type: "AI" | "PDF" | "Manual";
  reference_text?: string;
  reference_file_name?: string;
  reference_file_base64?: string;
  difficulty: string;
  cognitive_levels: string[];
  pg_options: string | null;
  include_illustration: boolean;
  topics: Array<{ topik: string; tujuan: string }>;
  formats: Array<{ id: string; label: string; count: number }>;
}

export interface Profile {
  id: number;
  subscription_tier: "free" | "basic" | "premium";
  credits_balance: number;
  subscription_expiry: string | null;
}

interface GeneratedQuestion {
  question_type: string;
  cognitive_level: string;
  difficulty: string;
  question_content: string;
  options: Record<string, string> | null;
  correct_answer: string;
  illustration_prompt?: string | null;
  illustration_image?: string | null;
}

const MAX_ILLUSTRATIONS = Number(Deno.env.get("AI_MAX_ILLUSTRATIONS_PER_EXAM") ?? "5");
const MAX_QUESTIONS_PER_AI_REQUEST = Number(Deno.env.get("AI_MAX_QUESTIONS_PER_REQUEST") ?? "15");

export function totalQuestions(formats: GenerateExamPayload["formats"]) {
  return formats.reduce((sum, format) => sum + Number(format.count ?? 0), 0);
}

export async function generateQuestions(profile: Profile, data: GenerateExamPayload) {
  const provider = hasPremiumAccess(profile)
    ? Deno.env.get("AI_PREMIUM_PROVIDER") ?? "openai"
    : Deno.env.get("AI_FREE_PROVIDER") ?? "gemini";
  const batches = chunkFormats(data.formats, MAX_QUESTIONS_PER_AI_REQUEST);
  const questions: GeneratedQuestion[] = [];

  for (const formats of batches) {
    const batchData = { ...data, formats };
    const batchTotal = totalQuestions(formats);
    questions.push(...await generateQuestionBatch(provider, batchData, batchTotal));
  }

  return questions;
}

async function generateQuestionBatch(provider: string, data: GenerateExamPayload, total: number) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const payload = provider === "openai"
        ? await generateWithOpenAi(data, total)
        : await generateWithGemini(data, total);
      return validateQuestions(payload, data, total);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Output AI tidak valid.");
}

export async function attachIllustrationImages(
  questions: GeneratedQuestion[],
  data: GenerateExamPayload,
  uploadImage: (path: string, bytes: Uint8Array) => Promise<string | null>,
) {
  if (!data.include_illustration) {
    return questions;
  }

  const expectedTypes = expectedTypesFromFormats(data.formats);
  let generatedCount = 0;

  const output: GeneratedQuestion[] = [];
  for (const [index, question] of questions.entries()) {
    const isMultipleChoice = expectedTypes[index]?.id === "pg";
    const prompt = question.illustration_prompt?.trim();

    if (!isMultipleChoice || !prompt || generatedCount >= MAX_ILLUSTRATIONS) {
      output.push({ ...question, illustration_prompt: null, illustration_image: null });
      continue;
    }

    generatedCount++;
    const imageUrl = await generateIllustration(prompt, uploadImage);
    output.push({ ...question, illustration_image: imageUrl });
  }

  return output;
}

function hasPremiumAccess(profile: Profile) {
  if (profile.subscription_tier !== "premium") {
    return false;
  }

  return !profile.subscription_expiry || new Date(profile.subscription_expiry).getTime() > Date.now();
}

async function generateWithGemini(data: GenerateExamPayload, total: number) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";
  const baseUrl = (Deno.env.get("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi di Supabase Function Secrets.");
  }

  const parts: unknown[] = [{ text: buildPrompt(data, total) }];
  if (data.reference_type === "PDF" && data.reference_file_base64) {
    parts.push({
      inline_data: {
        mime_type: "application/pdf",
        data: data.reference_file_base64,
      },
    });
  }

  const response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
        responseJsonSchema: questionSchema(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Gemini API mengembalikan error.");
  }

  const json = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("Gemini API tidak mengembalikan teks JSON.");
  }

  return JSON.parse(text);
}

async function generateWithOpenAi(data: GenerateExamPayload, total: number) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_PREMIUM_MODEL") ?? "gpt-5.4-mini";
  const baseUrl = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY belum dikonfigurasi di Supabase Function Secrets.");
  }

  const userContent: unknown[] = [{ type: "input_text", text: buildPrompt(data, total) }];
  if (data.reference_type === "PDF" && data.reference_file_base64) {
    userContent.push({
      type: "input_file",
      filename: data.reference_file_name ?? "referensi.pdf",
      file_data: `data:application/pdf;base64,${data.reference_file_base64}`,
    });
  }

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "Anda adalah penyusun soal ujian sekolah. Jawab hanya dengan JSON sesuai schema.",
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "exam_questions",
          strict: true,
          schema: questionSchema(),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error("OpenAI API mengembalikan error.");
  }

  const json = await response.json();
  const text = extractOpenAiText(json);
  if (!text) {
    throw new Error("OpenAI API tidak mengembalikan teks JSON.");
  }

  return JSON.parse(text);
}

async function generateIllustration(
  prompt: string,
  uploadImage: (path: string, bytes: Uint8Array) => Promise<string | null>,
) {
  if ((Deno.env.get("AI_GENERATE_ILLUSTRATIONS") ?? "true") === "false") {
    return null;
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return null;
  }

  const baseUrl = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-1",
      prompt: [
        "Buat ilustrasi edukatif untuk soal ujian sekolah dasar.",
        "Gaya: hitam putih, line art sederhana, jelas, ramah anak, komposisi sederhana, tanpa teks, tanpa watermark.",
        "Konten harus aman untuk anak dan relevan dengan instruksi berikut:",
        prompt,
      ].join("\n"),
      size: Deno.env.get("OPENAI_IMAGE_SIZE") ?? "1024x1024",
      quality: Deno.env.get("OPENAI_IMAGE_QUALITY") ?? "low",
      n: 1,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  const base64 = json?.data?.[0]?.b64_json;
  if (typeof base64 !== "string" || base64 === "") {
    return null;
  }

  const bytes = decodeBase64(base64);
  return uploadImage(`illustrations/${crypto.randomUUID()}.png`, bytes);
}

function buildPrompt(data: GenerateExamPayload, total: number) {
  return JSON.stringify({
    instruction: "Buat soal ujian berbahasa Indonesia formal untuk guru sekolah. Kembalikan hanya JSON valid sesuai schema.",
    total_questions: total,
    exam: {
      curriculum: data.curriculum,
      exam_type: data.exam_type,
      class_phase: data.class_phase,
      subject: data.subject,
      semester: data.semester,
      time_allocation_minutes: data.time_allocation,
      reference_type: data.reference_type,
      reference_text: referenceText(data),
      difficulty: data.difficulty,
      cognitive_levels: data.cognitive_levels,
      pg_options: data.pg_options,
      include_illustration: data.include_illustration,
    },
    topics: data.topics,
    formats: data.formats,
    rules: [
      "Jumlah item questions harus sama persis dengan total_questions.",
      "Jika reference_text tersedia, gunakan sebagai sumber materi utama.",
      "Jika file PDF tersedia di input provider, gunakan isi PDF sebagai sumber materi utama.",
      "Sebarkan level kognitif dan tingkat kesulitan sesuai input.",
      "Untuk PG dan PGK, isi options sebagai objek A/B/C/D/E sesuai opsi yang diminta.",
      "Untuk soal Pilihan Ganda, sebar kunci jawaban secara acak dan proporsional di A/B/C/D/E.",
      "Untuk Menjodohkan, Benar/Salah, Isian, dan Uraian, options boleh null kecuali jika format butuh opsi eksplisit.",
      "correct_answer harus berisi jawaban benar langsung. Untuk Uraian jangan menulis awalan Rubrik jawaban, Rubrik, atau label sejenis.",
      "illustration_prompt hanya diisi bila include_illustration true, question_type adalah Pilihan Ganda, dan soal benar-benar membutuhkan gambar untuk memahami konteks.",
      `Jangan memberi ilustrasi untuk semua soal. Jika include_illustration true, pilih maksimal ${MAX_ILLUSTRATIONS} soal Pilihan Ganda yang paling membutuhkan gambar; untuk soal lainnya isi illustration_prompt null.`,
      "Prompt ilustrasi harus meminta gambar hitam putih sederhana, jelas, tanpa teks, tanpa watermark, dan mudah dipahami guru/siswa.",
    ],
    json_shape: {
      questions: [{
        question_type: "Pilihan Ganda",
        cognitive_level: "C1 - Mengingat",
        difficulty: "Mudah",
        question_content: "...",
        options: { A: "...", B: "...", C: "...", D: "..." },
        correct_answer: "A",
        illustration_prompt: null,
      }],
    },
  });
}

function referenceText(data: GenerateExamPayload) {
  const text = data.reference_text?.trim();
  return text ? text.slice(0, 12000) : null;
}

function questionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            question_type: { type: "string" },
            cognitive_level: { type: "string" },
            difficulty: { type: "string" },
            question_content: { type: "string" },
            options: {
              type: ["object", "null"],
              additionalProperties: { type: "string" },
            },
            correct_answer: { type: "string" },
            illustration_prompt: { type: ["string", "null"] },
          },
          required: [
            "question_type",
            "cognitive_level",
            "difficulty",
            "question_content",
            "options",
            "correct_answer",
            "illustration_prompt",
          ],
        },
      },
    },
    required: ["questions"],
  };
}

function validateQuestions(payload: unknown, data: GenerateExamPayload, total: number): GeneratedQuestion[] {
  const questions = (payload as { questions?: unknown })?.questions;
  if (!Array.isArray(questions) || questions.length !== total) {
    throw new Error("Jumlah soal dari AI tidak sesuai permintaan.");
  }

  const expectedTypes = expectedTypesFromFormats(data.formats);
  return questions.map((rawQuestion, index) => {
    const question = rawQuestion as Partial<GeneratedQuestion>;
    for (const field of ["question_type", "cognitive_level", "difficulty", "question_content", "correct_answer"] as const) {
      if (typeof question[field] !== "string" || question[field]?.trim() === "") {
        throw new Error(`Field ${field} wajib diisi.`);
      }
    }

    const requiresOptions = ["pg", "pgk"].includes(expectedTypes[index]?.id ?? "");
    if (requiresOptions && (!question.options || Object.keys(question.options).length < 2)) {
      throw new Error("Pilihan jawaban wajib ada untuk PG/PGK.");
    }

    let options = question.options && typeof question.options === "object" ? question.options : null;
    let answer = cleanAnswer(question.correct_answer ?? "");
    if (requiresOptions && options) {
      [options, answer] = shuffleOptions(options, answer);
    }

    return {
      question_type: question.question_type ?? "",
      cognitive_level: question.cognitive_level ?? "",
      difficulty: question.difficulty ?? "",
      question_content: question.question_content ?? "",
      options,
      correct_answer: answer,
      illustration_prompt: typeof question.illustration_prompt === "string" && question.illustration_prompt.trim() !== ""
        ? question.illustration_prompt
        : null,
    };
  });
}

function expectedTypesFromFormats(formats: GenerateExamPayload["formats"]) {
  const types: Array<{ id: string; label: string }> = [];
  for (const format of formats) {
    for (let index = 0; index < Number(format.count); index++) {
      types.push({ id: String(format.id), label: String(format.label) });
    }
  }
  return types;
}

function chunkFormats(formats: GenerateExamPayload["formats"], maxQuestions: number) {
  const safeMaxQuestions = Math.max(1, maxQuestions);
  const chunks: GenerateExamPayload["formats"][] = [];
  let currentChunk: GenerateExamPayload["formats"] = [];
  let currentCount = 0;

  for (const format of formats) {
    let remainingCount = Number(format.count ?? 0);

    while (remainingCount > 0) {
      const availableSlots = safeMaxQuestions - currentCount;
      const takeCount = Math.min(remainingCount, availableSlots);

      currentChunk.push({
        ...format,
        count: takeCount,
      });
      currentCount += takeCount;
      remainingCount -= takeCount;

      if (currentCount >= safeMaxQuestions) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentCount = 0;
      }
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function cleanAnswer(answer: string) {
  return answer.replace(/^\s*(rubrik\s+jawaban|rubrik|pedoman\s+jawaban|kunci\s+jawaban)\s*[:：\-.]\s*/iu, "").trim();
}

function shuffleOptions(options: Record<string, string>, answer: string): [Record<string, string>, string] {
  const entries = Object.entries(options).map(([key, value]) => ({ oldKey: key.toUpperCase(), value: String(value) }));
  const correctValues = answer
    .toUpperCase()
    .split(/\s*,\s*/)
    .map((key) => entries.find((entry) => entry.oldKey === key)?.value)
    .filter((value): value is string => Boolean(value));

  if (correctValues.length === 0 && answer !== "") {
    const matched = entries.find((entry) => entry.value.trim() === answer.trim());
    if (matched) {
      correctValues.push(matched.value);
    }
  }

  const letters = entries.map((_, index) => String.fromCharCode(65 + index));
  if (correctValues.length === 1) {
    const correctValue = correctValues[0];
    const targetLetter = letters[Math.floor(Math.random() * letters.length)];
    const remaining = shuffle(entries.filter((entry) => entry.value !== correctValue).map((entry) => entry.value));
    const nextOptions: Record<string, string> = {};
    for (const letter of letters) {
      nextOptions[letter] = letter === targetLetter ? correctValue : String(remaining.shift() ?? "");
    }
    return [nextOptions, targetLetter];
  }

  const shuffled = shuffle(entries);
  const nextOptions: Record<string, string> = {};
  const nextAnswers: string[] = [];
  for (const [index, entry] of shuffled.entries()) {
    const letter = letters[index];
    nextOptions[letter] = entry.value;
    if (correctValues.includes(entry.value)) {
      nextAnswers.push(letter);
    }
  }

  return [nextOptions, nextAnswers.length > 0 ? nextAnswers.join(",") : answer];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function extractOpenAiText(payload: unknown) {
  const data = payload as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
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

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
