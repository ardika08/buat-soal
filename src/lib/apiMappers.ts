/**
 * Pemetaan data mentah Supabase menjadi tipe aplikasi.
 *
 * Semua baris dari database melewati fungsi di sini. Berkas ini sengaja tidak
 * mengimpor apa pun (baik modul aplikasi maupun klien Supabase) supaya bisa diuji
 * langsung dengan `node --test` tanpa browser maupun jaringan.
 *
 * Aturan tetap: kolom yang hilang atau berbentuk tak terduga harus menghasilkan
 * nilai yang pasti (angka, string kosong, daftar kosong), bukan `undefined` yang
 * bocor ke layar sebagai "NaN" atau halaman kosong.
 */

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  subscription_tier: "free" | "premium";
  credits_balance: number;
  subscription_expiry: string | null;
  has_purchased_credits: boolean;
}

export interface ExamFormat {
  id: string;
  label: string;
  count: number;
}

export interface Topic {
  topik: string;
  tujuan: string;
  capaian?: string;
}

export interface DifficultyDistribution {
  lots: number;
  mots: number;
  hots: number;
}

export interface GenerateExamPayload {
  curriculum: string;
  exam_type: string;
  class_phase: string;
  subject: string;
  semester: string;
  time_allocation: number;
  reference_type: "AI" | "PDF" | "Manual";
  reference_text?: string;
  reference_file?: File | null;
  difficulty: string;
  pg_options: string | null;
  difficulty_distribution: DifficultyDistribution;
  include_illustration: boolean;
  cognitive_levels: string[];
  topics: Topic[];
  formats: ExamFormat[];
}

export interface Question {
  id: number;
  exam_session_id: number;
  order_number: number;
  question_type: string;
  cognitive_level: string;
  difficulty: string;
  question_content: string;
  options: Record<string, string> | null;
  correct_answer: string;
  explanation: string | null;
  illustration_prompt: string | null;
  illustration_image: string | null;
}

export interface ExamSession {
  id: number;
  user_id: number;
  curriculum: string;
  exam_type: string;
  class_phase: string;
  subject: string;
  semester: string;
  time_allocation: number;
  reference_type: string;
  difficulty: string;
  cognitive_levels: string[];
  pg_options: string | null;
  include_illustration: boolean;
  topics: Topic[];
  credits_consumed: number;
  questions_count?: number;
  created_at: string;
  questions?: Question[];
}

export type SubscriptionTier = AuthUser["subscription_tier"];

/** Bilangan yang pasti; nilai tak terduga jatuh ke `fallback`. */
function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Teks yang pasti; null/undefined menjadi string kosong, bukan "null". */
function toText(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

/** Teks opsional: hanya null/undefined/kosong yang menjadi null. */
function toOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value);
  return text === "" ? null : text;
}

function toTextArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function toObjectArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

/**
 * Hanya tier yang dikenal yang lolos. Kolom ini menentukan akses premium, jadi
 * nilai asing (enum baru, salah ketik, data lama) diperlakukan sebagai `free` —
 * gagal ke arah yang aman, bukan memberi hak istimewa.
 */
export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  return value === "premium" ? "premium" : "free";
}

export function formatUser(profile: Record<string, unknown>): AuthUser {
  return {
    id: toNumber(profile.id),
    name: toText(profile.name),
    email: toText(profile.email),
    subscription_tier: normalizeSubscriptionTier(profile.subscription_tier),
    credits_balance: toNumber(profile.credits_balance),
    subscription_expiry: toOptionalText(profile.subscription_expiry),
    has_purchased_credits: profile.has_purchased_credits === true,
  };
}

export function normalizeExam(exam: Record<string, unknown>): ExamSession {
  return {
    id: toNumber(exam.id),
    user_id: toNumber(exam.user_id),
    curriculum: toText(exam.curriculum),
    exam_type: toText(exam.exam_type),
    class_phase: toText(exam.class_phase),
    subject: toText(exam.subject),
    semester: toText(exam.semester),
    time_allocation: toNumber(exam.time_allocation),
    reference_type: toText(exam.reference_type),
    difficulty: toText(exam.difficulty),
    cognitive_levels: toTextArray(exam.cognitive_levels),
    pg_options: toOptionalText(exam.pg_options),
    include_illustration: Boolean(exam.include_illustration),
    topics: toObjectArray<Topic>(exam.topics),
    credits_consumed: toNumber(exam.credits_consumed),
    created_at: toText(exam.created_at),
  };
}

export function normalizeQuestion(question: Record<string, unknown>): Question {
  const options = question.options;

  return {
    id: toNumber(question.id),
    exam_session_id: toNumber(question.exam_session_id),
    order_number: toNumber(question.order_number),
    question_type: toText(question.question_type),
    cognitive_level: toText(question.cognitive_level),
    difficulty: toText(question.difficulty),
    question_content: toText(question.question_content),
    // Array lolos `typeof === "object"` tetapi bukan peta pilihan jawaban.
    options: options !== null && typeof options === "object" && !Array.isArray(options)
      ? options as Record<string, string>
      : null,
    correct_answer: toText(question.correct_answer),
    explanation: toOptionalText(question.explanation),
    illustration_prompt: toOptionalText(question.illustration_prompt),
    illustration_image: toOptionalText(question.illustration_image),
  };
}

function readIndexedArray(formData: FormData, key: string): string[] {
  const values: string[] = [];
  for (const [field, value] of formData.entries()) {
    const match = field.match(new RegExp(`^${key}\\[(\\d+)\\]$`));
    if (match) {
      values[Number(match[1])] = String(value);
    }
  }
  return values.filter(Boolean);
}

/**
 * Membaca field berindeks (`key[0][prop]`). Urutan entri FormData mengikuti urutan
 * input di DOM, jadi hasilnya diurutkan lewat indeks supaya daftar tidak terbalik
 * dan jumlah soal tiap format tidak tertukar.
 */
function readIndexedObjects<T>(formData: FormData, key: string, map: (value: Record<string, string>) => T): T[] {
  const values: Record<number, Record<string, string>> = {};
  for (const [field, value] of formData.entries()) {
    const match = field.match(new RegExp(`^${key}\\[(\\d+)\\]\\[(\\w+)\\]$`));
    if (match) {
      const index = Number(match[1]);
      values[index] = values[index] ?? {};
      values[index][match[2]] = String(value);
    }
  }
  return Object.keys(values)
    .map(Number)
    .sort((a, b) => a - b)
    .map((index) => map(values[index]));
}

function readNamedObject(formData: FormData, key: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [field, value] of formData.entries()) {
    const match = field.match(new RegExp(`^${key}\\[(\\w+)\\]$`));
    if (match) {
      values[match[1]] = String(value);
    }
  }
  return values;
}

export const DEFAULT_DIFFICULTY_DISTRIBUTION: DifficultyDistribution = {
  lots: 50,
  mots: 30,
  hots: 20,
};

export const DEFAULT_TIME_ALLOCATION = 90;

function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function payloadFromFormData(
  formData: FormData,
): Promise<GenerateExamPayload & { reference_file_name?: string; reference_file_base64?: string }> {
  const formats = readIndexedObjects<ExamFormat>(formData, "formats", (value) => ({
    id: String(value.id ?? ""),
    label: String(value.label ?? ""),
    count: Number(value.count ?? 0),
  }));
  const topics = readIndexedObjects<Topic>(formData, "topics", (value) => {
    const topic: Topic = {
      topik: String(value.topik ?? ""),
      tujuan: String(value.tujuan ?? ""),
    };
    // Hanya sertakan capaian bila benar-benar diisi, supaya tidak bocor
    // `capaian: undefined`/kosong ke payload (lihat aturan berkas ini).
    if (typeof value.capaian === "string" && value.capaian !== "") {
      topic.capaian = value.capaian;
    }
    return topic;
  });
  const cognitiveLevels = readIndexedArray(formData, "cognitive_levels");
  const difficultyDistribution = readNamedObject(formData, "difficulty_distribution");
  const file = formData.get("reference_file");
  const filePayload = file instanceof File
    ? {
        reference_file_name: file.name,
        reference_file_base64: await fileToBase64(file),
      }
    : {};

  return {
    curriculum: String(formData.get("curriculum") ?? ""),
    exam_type: String(formData.get("exam_type") ?? ""),
    class_phase: String(formData.get("class_phase") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    semester: String(formData.get("semester") ?? ""),
    time_allocation: Number(formData.get("time_allocation") ?? DEFAULT_TIME_ALLOCATION),
    reference_type: String(formData.get("reference_type") ?? "AI") as GenerateExamPayload["reference_type"],
    difficulty: String(formData.get("difficulty") ?? ""),
    pg_options: String(formData.get("pg_options") ?? "") || null,
    difficulty_distribution: {
      lots: Number(difficultyDistribution.lots ?? DEFAULT_DIFFICULTY_DISTRIBUTION.lots),
      mots: Number(difficultyDistribution.mots ?? DEFAULT_DIFFICULTY_DISTRIBUTION.mots),
      hots: Number(difficultyDistribution.hots ?? DEFAULT_DIFFICULTY_DISTRIBUTION.hots),
    },
    include_illustration: ["1", "true", "on"].includes(String(formData.get("include_illustration"))),
    cognitive_levels: cognitiveLevels,
    topics,
    formats,
    ...filePayload,
  };
}
