import type { ExamSession, Question } from "@/lib/apiMappers";

export interface QualityDistributionItem {
  label: string;
  count: number;
  percentage: number;
}

export interface QualityWarning {
  kind: "duplicate" | "ambiguous";
  questionNumbers: number[];
  message: string;
}

export interface ExamQualityAnalysis {
  difficulty: QualityDistributionItem[];
  cognitive: QualityDistributionItem[];
  topics: QualityDistributionItem[];
  warnings: QualityWarning[];
  estimatedMinutes: number;
}

const DIFFICULTY_ORDER = ["Mudah", "Sedang", "Sulit", "Belum diisi"];
const COGNITIVE_ORDER = ["C1", "C2", "C3", "C4", "C5", "C6", "Belum diisi"];

export function analyzeExamQuality(exam: ExamSession, questions: Question[]): ExamQualityAnalysis {
  const sorted = [...questions].sort((a, b) => a.order_number - b.order_number);
  const topicNames = exam.topics.map((topic) => topic.topik.trim()).filter(Boolean);
  const topicLabels = sorted.map((_, index) => topicNames[index % Math.max(topicNames.length, 1)] || "Belum dipetakan");

  return {
    difficulty: distribution(sorted.map((question) => normalizeDifficulty(question.difficulty)), DIFFICULTY_ORDER),
    cognitive: distribution(sorted.map((question) => normalizeCognitive(question.cognitive_level)), COGNITIVE_ORDER),
    topics: distribution(topicLabels),
    warnings: [...duplicateWarnings(sorted), ...ambiguousWarnings(sorted)],
    estimatedMinutes: Math.max(1, Math.ceil(sorted.reduce((total, question) => total + questionMinutes(question), 0))),
  };
}

function distribution(values: string[], preferredOrder: string[] = []): QualityDistributionItem[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const labels = [...counts.keys()].sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a);
    const bIndex = preferredOrder.indexOf(b);
    if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? preferredOrder.length : aIndex) - (bIndex < 0 ? preferredOrder.length : bIndex);
    return a.localeCompare(b, "id");
  });
  return labels.map((label) => ({
    label,
    count: counts.get(label) ?? 0,
    percentage: values.length === 0 ? 0 : Math.round(((counts.get(label) ?? 0) / values.length) * 100),
  }));
}

function duplicateWarnings(questions: Question[]): QualityWarning[] {
  const groups = new Map<string, number[]>();
  for (const question of questions) {
    const fingerprint = normalizeText(question.question_content);
    if (!fingerprint) continue;
    groups.set(fingerprint, [...(groups.get(fingerprint) ?? []), question.order_number]);
  }
  return [...groups.values()]
    .filter((numbers) => numbers.length > 1)
    .map((numbers) => ({
      kind: "duplicate",
      questionNumbers: numbers,
      message: `Soal nomor ${numbers.join(", ")} memiliki pertanyaan identik.`,
    }));
}

function ambiguousWarnings(questions: Question[]): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  for (const question of questions) {
    const problems: string[] = [];
    const answer = question.correct_answer.trim();
    if (!answer) problems.push("kunci jawaban kosong");

    if (question.options) {
      const entries = Object.entries(question.options);
      if (entries.length < 2) problems.push("pilihan jawaban kurang dari dua");
      if (answer && !Object.prototype.hasOwnProperty.call(question.options, answer)) problems.push("kunci tidak cocok dengan pilihan");
      if (entries.some(([, value]) => !value.trim())) problems.push("ada pilihan kosong");

      const normalizedOptions = entries.map(([, value]) => normalizeText(value)).filter(Boolean);
      if (new Set(normalizedOptions).size < normalizedOptions.length) problems.push("ada pilihan jawaban identik");
    }

    if (problems.length > 0) {
      warnings.push({
        kind: "ambiguous",
        questionNumbers: [question.order_number],
        message: `Soal nomor ${question.order_number}: ${problems.join("; ")}.`,
      });
    }
  }
  return warnings;
}

function questionMinutes(question: Question): number {
  const type = normalizeText(question.question_type);
  let minutes = 2;
  if (type.includes("uraian") || type.includes("esai")) minutes = 5;
  else if (type.includes("isian")) minutes = 2;
  else if (type.includes("menjodohkan")) minutes = 2.5;
  else if (type.includes("kompleks")) minutes = 2;
  else if (type.includes("benar/salah")) minutes = 1;
  else if (type.includes("pilihan ganda")) minutes = 1.5;

  const difficulty = normalizeDifficulty(question.difficulty);
  if (difficulty === "Sulit") return minutes * 1.25;
  if (difficulty === "Mudah") return minutes * 0.85;
  return minutes;
}

function normalizeDifficulty(value: string): string {
  const normalized = normalizeText(value);
  if (normalized === "mudah") return "Mudah";
  if (normalized === "sedang") return "Sedang";
  if (normalized === "sulit") return "Sulit";
  return "Belum diisi";
}

function normalizeCognitive(value: string): string {
  const match = value.toUpperCase().match(/C[1-6]/);
  return match?.[0] ?? "Belum diisi";
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
}
