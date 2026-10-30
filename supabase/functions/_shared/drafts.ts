/**
 * Ringkasan draf terakhir (soal & e-modul) untuk beranda workspace.
 *
 * Murni tanpa I/O supaya bisa diuji dengan `node --test`. Pemanggil mengambil
 * sesi ujian terakhir — dan kelak sesi e-modul — lalu menyusunnya di sini.
 * Draf e-modul masih `null` karena tabelnya baru dibuat pada siklus E-Modul.
 */

export interface ExamDraftSummary {
  id: number;
  subject: string;
  class_phase: string;
  exam_type: string;
  created_at: string | null;
  questions_count: number;
}

export interface EModulDraftSummary {
  id: string;
  title: string;
  subject: string;
  class_phase: string;
  chapters: number;
  progress: number;
  updated_at: string | null;
}

export interface RecentDrafts {
  exam_draft: ExamDraftSummary | null;
  e_modul_draft: EModulDraftSummary | null;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function toOptionalText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

export function buildExamDraft(
  exam: Record<string, unknown> | null | undefined,
  questionsCount = 0,
): ExamDraftSummary | null {
  if (!exam || exam.id === null || exam.id === undefined) {
    return null;
  }

  return {
    id: toNumber(exam.id),
    subject: toText(exam.subject),
    class_phase: toText(exam.class_phase),
    exam_type: toText(exam.exam_type),
    created_at: toOptionalText(exam.created_at),
    questions_count: toNumber(questionsCount),
  };
}

export function buildRecentDrafts(input: {
  exam?: Record<string, unknown> | null;
  questionsCount?: number;
  eModul?: EModulDraftSummary | null;
}): RecentDrafts {
  return {
    exam_draft: buildExamDraft(input.exam, input.questionsCount ?? 0),
    e_modul_draft: input.eModul ?? null,
  };
}
