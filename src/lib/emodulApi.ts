/**
 * API klien modul E-Modul.
 *
 * Semua fungsi di sini memanggil Edge Function yang sudah ada di server
 * (`emodul-*`) — tidak ada data tiruan. Tipe & pemetaan respons tinggal di
 * `emodulMappers.ts` (murni, teruji tanpa browser); berkas ini hanya mengurus
 * pemanggilan jaringan.
 */

import { normalizeEModulDetail, normalizeEModulSummary } from "@/lib/emodulMappers";
import type { EModulDetail, EModulListItem, EModulSectionKind, EModulSummary } from "@/lib/emodulMappers";
import { invokeFunction } from "@/lib/invoke";
import { supabase } from "@/lib/supabase";

export type {
  EModulChapter,
  EModulDetail,
  EModulListItem,
  EModulSection,
  EModulSectionKind,
  EModulSession,
  EModulSummary,
} from "@/lib/emodulMappers";
export { normalizeEModulDetail, normalizeEModulSummary, truncateForTitle } from "@/lib/emodulMappers";

/** Konfigurasi wizard yang dikirim ke `emodul-generate`. */
export interface GenerateEModulInput {
  topics: { topik: string; capaian: string }[];
  fase: string;
  kelas: string;
  subject: string;
  semester: string;
  chapters: number;
  subChapters: number;
  exerciseShare: number;
}

export interface GenerateEModulResult {
  e_modul_id: number;
  title: string;
  credits_required: number;
  credits_remaining: number;
  summary: EModulSummary;
}

export type EModulManageAction =
  | { action: "reorder_chapters"; eModulId: number; chapterIds: number[] }
  | { action: "reorder_sections"; chapterId: number; sectionIds: number[] }
  | { action: "add_section"; chapterId: number; kind: EModulSectionKind; title?: string; content?: string }
  | { action: "delete_section"; sectionId: number }
  | { action: "add_chapter"; eModulId: number; title?: string }
  | { action: "delete_chapter"; chapterId: number };

export interface EModulStructureFinding {
  code: string;
  level: "error" | "warning";
  message: string;
  chapterId: number | null;
  sectionId: number | null;
}

export interface EModulStructureReport {
  ready: boolean;
  score: number;
  findings: EModulStructureFinding[];
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const emodulApi = {
  /**
   * Daftar modul milik guru (halaman pustaka).
   *
   * Dibaca langsung lewat PostgREST dengan RLS "Users can read own e-moduls",
   * jadi tidak perlu Edge Function baru untuk daftar.
   */
  list: async (limit = 50): Promise<EModulListItem[]> => {
    const { data, error } = await supabase
      .from("e_modul_sessions")
      .select("id,title,subject,fase,kelas,semester,status,chapters_target,sub_chapters_target,credits_consumed,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: num(row.id),
      title: text(row.title) || "E-Modul Baru",
      subject: text(row.subject),
      fase: text(row.fase),
      kelas: text(row.kelas),
      semester: text(row.semester),
      status: row.status === "ready" ? "ready" : "draft",
      chaptersTarget: num(row.chapters_target),
      subChaptersTarget: num(row.sub_chapters_target),
      creditsConsumed: num(row.credits_consumed),
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
    }));
  },

  generate: async (input: GenerateEModulInput): Promise<GenerateEModulResult> => {
    const result = await invokeFunction<{
      e_modul?: Record<string, unknown>;
      credits_required: number;
      credits_remaining: number;
    }>("emodul-generate", {
      topics: input.topics,
      fase: input.fase,
      kelas: input.kelas,
      subject: input.subject,
      semester: input.semester,
      chapters: input.topics.length,
      sub_chapters: input.subChapters,
      exercise_share: input.exerciseShare,
      // Kunci idempotensi: klik ganda tidak memotong kredit dua kali.
      idempotency_key: crypto.randomUUID(),
    });

    return {
      e_modul_id: num(result.e_modul?.id),
      title: text(result.e_modul?.title),
      credits_required: num(result.credits_required),
      credits_remaining: num(result.credits_remaining),
      summary: normalizeEModulSummary(result.e_modul?.summary, []),
    };
  },

  detail: async (eModulId: number): Promise<EModulDetail> =>
    normalizeEModulDetail(await invokeFunction("emodul-detail", { e_modul_id: eModulId })),

  autosaveSection: async (
    sectionId: number,
    patch: { title?: string; content?: string },
  ): Promise<{ sectionId: number; title: string; content: string }> => {
    const result = await invokeFunction<{ section?: Record<string, unknown> }>("emodul-autosave", {
      section_id: sectionId,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
    });

    const section = (result.section ?? {}) as Record<string, unknown>;
    return {
      sectionId: num(section.id ?? sectionId),
      title: text(section.title),
      content: text(section.content),
    };
  },

  manage: async (action: EModulManageAction): Promise<void> => {
    const payload = { ...action } as Record<string, unknown>;

    if ("eModulId" in action) {
      payload.e_modul_id = action.eModulId;
      delete payload.eModulId;
    }
    if ("chapterId" in action) {
      payload.chapter_id = action.chapterId;
      delete payload.chapterId;
    }
    if ("sectionId" in action) {
      payload.section_id = action.sectionId;
      delete payload.sectionId;
    }
    if ("chapterIds" in action) {
      payload.chapter_ids = action.chapterIds;
      delete payload.chapterIds;
    }
    if ("sectionIds" in action) {
      payload.section_ids = action.sectionIds;
      delete payload.sectionIds;
    }

    await invokeFunction("emodul-manage", payload);
  },

  regenerateSection: async (
    sectionId: number,
    instruction?: string,
  ): Promise<{ content: string; credits_remaining: number }> => {
    const result = await invokeFunction<{ content?: unknown; credits_remaining?: unknown }>(
      "emodul-regenerate",
      {
        section_id: sectionId,
        ...(instruction?.trim() ? { instruction: instruction.trim() } : {}),
        idempotency_key: crypto.randomUUID(),
      },
    );

    return {
      content: text(result.content),
      credits_remaining: num(result.credits_remaining),
    };
  },

  checkStructure: async (eModulId: number): Promise<EModulStructureReport> => {
    const result = await invokeFunction<{
      ready?: unknown;
      score?: unknown;
      findings?: unknown;
    }>("emodul-structure-check", { e_modul_id: eModulId });

    return {
      ready: Boolean(result.ready),
      score: num(result.score),
      findings: (Array.isArray(result.findings) ? result.findings : []).map((raw) => {
        const finding = raw as Record<string, unknown>;
        return {
          code: text(finding.code),
          level: finding.level === "warning" ? "warning" : "error",
          message: text(finding.message),
          chapterId: finding.chapterId == null ? null : num(finding.chapterId),
          sectionId: finding.sectionId == null ? null : num(finding.sectionId),
        };
      }),
    };
  },

  exportDocument: async (
    eModulId: number,
    format: "pdf" | "docx",
  ): Promise<{ filename: string; mime: string; base64: string }> => {
    const result = await invokeFunction<{
      filename?: unknown;
      mime?: unknown;
      content_base64?: unknown;
    }>("emodul-export", { e_modul_id: eModulId, format });

    return {
      filename: text(result.filename) || `e-modul.${format}`,
      mime: text(result.mime) || (format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      base64: text(result.content_base64),
    };
  },

  entitlement: async (): Promise<{ entitled: boolean; tier: string; reason: string }> => {
    const result = await invokeFunction<Record<string, unknown>>("emodul-entitlement", {});
    return {
      entitled: Boolean(result.entitled),
      tier: text(result.tier) || "free",
      reason: text(result.reason) || "upgrade_required",
    };
  },
};
