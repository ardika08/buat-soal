/**
 * Pemeriksaan struktur e-modul di klien.
 *
 * Aturannya sengaja identik dengan validator server
 * (`supabase/functions/_shared/emodul-structure.ts`): pesan & tingkat keparahan
 * sama, hanya nama field yang mengikuti tipe aplikasi. Murni tanpa I/O supaya
 * bisa diuji dengan `node --test`.
 */

export type StructureSeverity = "error" | "warning" | "info";

export interface StructureSectionInput {
  id: number;
  order: number;
  kind: "materi" | "latihan";
  title: string;
  content: string;
}

export interface StructureChapterInput {
  id: number;
  order: number;
  title: string;
  sections: StructureSectionInput[];
}

export interface StructureDraftInput {
  title: string;
  topics: Array<{ topik: string; capaian: string }>;
  chapters: StructureChapterInput[];
}

export interface StructureFinding {
  id: string;
  severity: StructureSeverity;
  message: string;
  /** Bagian yang dituju — dipakai navigasi temuan. */
  chapterId?: number;
  sectionId?: number;
}

export interface StructureReport {
  ready: boolean;
  findings: StructureFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

/** Isi bagian dianggap terlalu pendek bila kurang dari jumlah karakter ini. */
export const MIN_SECTION_CONTENT_LENGTH = 20;

const SEVERITY_RANK: Record<StructureSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function checkEModulStructure(draft: StructureDraftInput): StructureReport {
  const findings: StructureFinding[] = [];

  const add = (
    severity: StructureSeverity,
    message: string,
    target: { chapterId?: number; sectionId?: number } = {},
  ) => {
    findings.push({
      id: `structure-${findings.length + 1}`,
      severity,
      message,
      chapterId: target.chapterId,
      sectionId: target.sectionId,
    });
  };

  if (!draft.title.trim()) {
    add("error", "Judul modul masih kosong.");
  }

  const topics = draft.topics.filter((topic) => topic.topik.trim());
  if (topics.length === 0) {
    add("error", "Belum ada topik pembelajaran.");
  }
  for (const topic of topics) {
    if (!topic.capaian.trim()) {
      add("warning", `Capaian pembelajaran untuk topik "${topic.topik.trim()}" belum diisi.`);
    }
  }

  if (draft.chapters.length === 0) {
    add("error", "Modul belum punya bab.");
  }

  for (const chapter of draft.chapters) {
    const chapterLabel = chapter.title.trim() || `Bab ${chapter.order}`;

    if (!chapter.title.trim()) {
      add("warning", `Judul bab ${chapter.order} masih kosong.`, { chapterId: chapter.id });
    }

    const hasMateri = chapter.sections.some((section) => section.kind === "materi");
    const hasLatihan = chapter.sections.some((section) => section.kind === "latihan");

    if (!hasMateri) {
      add("error", `${chapterLabel} belum punya subbab materi.`, { chapterId: chapter.id });
    }
    if (!hasLatihan) {
      add("info", `${chapterLabel} belum punya latihan.`, { chapterId: chapter.id });
    }

    for (const section of chapter.sections) {
      const label = section.title.trim() || `bagian ${chapter.order}.${section.order}`;
      const content = section.content.trim();

      if (!section.title.trim()) {
        add("warning", `Judul bagian ${chapter.order}.${section.order} masih kosong.`, {
          chapterId: chapter.id,
          sectionId: section.id,
        });
      }

      if (!content) {
        add("warning", `Isi ${label} masih kosong.`, {
          chapterId: chapter.id,
          sectionId: section.id,
        });
      } else if (content.length < MIN_SECTION_CONTENT_LENGTH) {
        add(
          "warning",
          `Isi ${label} terlalu pendek (minimal ${MIN_SECTION_CONTENT_LENGTH} karakter).`,
          { chapterId: chapter.id, sectionId: section.id },
        );
      }
    }
  }

  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const infoCount = findings.filter((finding) => finding.severity === "info").length;

  return {
    ready: errorCount === 0,
    findings,
    errorCount,
    warningCount,
    infoCount,
  };
}
