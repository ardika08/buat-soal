/**
 * Pemeriksaan struktur e-modul di sisi server — murni tanpa I/O.
 *
 * Aturannya sengaja sama dengan pratinjau live di editor
 * (`src/lib/emodulStructure.ts`): pesan & tingkat keparahan identik agar guru
 * melihat hasil yang konsisten. Versi server adalah otoritas saat menyimpan
 * status draf (`draft`/`ready`).
 */

export type StructureSeverity = "error" | "warning" | "info";

export interface StructureSectionInput {
  id: number;
  order_number: number;
  kind: "materi" | "latihan";
  title: string;
  content: string;
}

export interface StructureChapterInput {
  id: number;
  order_number: number;
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
  chapter_id?: number;
  section_id?: number;
}

export interface StructureReport {
  ready: boolean;
  findings: StructureFinding[];
  error_count: number;
  warning_count: number;
  info_count: number;
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
    target: { chapter_id?: number; section_id?: number } = {},
  ) => {
    findings.push({
      id: `structure-${findings.length + 1}`,
      severity,
      message,
      ...target,
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
    const chapterLabel = chapter.title.trim() || `Bab ${chapter.order_number}`;

    if (!chapter.title.trim()) {
      add("warning", `Judul bab ${chapter.order_number} masih kosong.`, { chapter_id: chapter.id });
    }

    const hasMateri = chapter.sections.some((section) => section.kind === "materi");
    const hasLatihan = chapter.sections.some((section) => section.kind === "latihan");

    if (!hasMateri) {
      add("error", `${chapterLabel} belum punya subbab materi.`, { chapter_id: chapter.id });
    }
    if (!hasLatihan) {
      add("info", `${chapterLabel} belum punya latihan.`, { chapter_id: chapter.id });
    }

    for (const section of chapter.sections) {
      const label = section.title.trim() || `bagian ${chapter.order_number}.${section.order_number}`;
      const content = section.content.trim();

      if (!section.title.trim()) {
        add("warning", `Judul bagian ${chapter.order_number}.${section.order_number} masih kosong.`, {
          chapter_id: chapter.id,
          section_id: section.id,
        });
      }

      if (!content) {
        add("warning", `Isi ${label} masih kosong.`, {
          chapter_id: chapter.id,
          section_id: section.id,
        });
      } else if (content.length < MIN_SECTION_CONTENT_LENGTH) {
        add(
          "warning",
          `Isi ${label} terlalu pendek (minimal ${MIN_SECTION_CONTENT_LENGTH} karakter).`,
          { chapter_id: chapter.id, section_id: section.id },
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
    error_count: errorCount,
    warning_count: warningCount,
    info_count: infoCount,
  };
}
