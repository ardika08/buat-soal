/**
 * Pemetaan respons e-modul menjadi tipe aplikasi — murni tanpa I/O.
 *
 * Berkas ini sengaja tidak mengimpor apa pun (termasuk klien Supabase) supaya
 * bisa diuji langsung dengan `node --test` tanpa browser maupun jaringan.
 * Aturan tetap: kolom yang hilang/berbentuk tak terduga menghasilkan nilai pasti
 * (0, string kosong, daftar kosong), bukan `undefined` yang bocor ke layar.
 */

export type EModulSectionKind = "materi" | "latihan";

export interface EModulSection {
  id: number;
  order: number;
  kind: EModulSectionKind;
  title: string;
  content: string;
}

export interface EModulChapter {
  id: number;
  order: number;
  title: string;
  sections: EModulSection[];
}

export interface EModulSession {
  id: number;
  title: string;
  subject: string;
  fase: string;
  kelas: string;
  semester: string;
  topics: { topik: string; capaian: string }[];
  status: "draft" | "ready";
  credits_consumed: number;
  chapters_target: number;
  sub_chapters_target: number;
  exercise_share: number;
  created_at: string;
  updated_at: string;
}

export interface EModulSummary {
  chapters: number;
  materi_sections: number;
  latihan_sections: number;
  total_sections: number;
}

export interface EModulDetail {
  eModul: EModulSession;
  chapters: EModulChapter[];
  summary: EModulSummary;
}

/** Ringkasan satu modul untuk halaman pustaka. */
export interface EModulListItem {
  id: number;
  title: string;
  subject: string;
  fase: string;
  kelas: string;
  semester: string;
  status: "draft" | "ready";
  chaptersTarget: number;
  subChaptersTarget: number;
  creditsConsumed: number;
  createdAt: string;
  updatedAt: string;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalizeTopicList(value: unknown): { topik: string; capaian: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({
    topik: text((item as { topik?: unknown })?.topik),
    capaian: text((item as { capaian?: unknown })?.capaian),
  }));
}

/** Pemetaan respons `emodul-detail` menjadi tipe aplikasi tanpa `undefined`. */
export function normalizeEModulDetail(raw: unknown): EModulDetail {
  const data = (raw ?? {}) as Record<string, unknown>;
  const session = (data.e_modul ?? {}) as Record<string, unknown>;

  const chapters: EModulChapter[] = (Array.isArray(data.chapters) ? data.chapters : []).map(
    (rawChapter) => {
      const chapter = rawChapter as Record<string, unknown>;
      return {
        id: num(chapter.id),
        order: num(chapter.order_number),
        title: text(chapter.title),
        sections: (Array.isArray(chapter.sections) ? chapter.sections : []).map((rawSection) => {
          const section = rawSection as Record<string, unknown>;
          return {
            id: num(section.id),
            order: num(section.order_number),
            kind: section.kind === "latihan" ? "latihan" : "materi",
            title: text(section.title),
            content: text(section.content),
          };
        }),
      };
    },
  );

  return {
    eModul: {
      id: num(session.id),
      title: text(session.title) || "E-Modul Baru",
      subject: text(session.subject),
      fase: text(session.fase),
      kelas: text(session.kelas),
      semester: text(session.semester) || "Ganjil",
      topics: normalizeTopicList(session.topics),
      status: session.status === "ready" ? "ready" : "draft",
      credits_consumed: num(session.credits_consumed),
      chapters_target: num(session.chapters_target),
      sub_chapters_target: num(session.sub_chapters_target),
      exercise_share: num(session.exercise_share),
      created_at: text(session.created_at),
      updated_at: text(session.updated_at),
    },
    chapters,
    summary: normalizeEModulSummary(data.summary, chapters),
  };
}

/**
 * Ringkasan terhitung ulang dari struktur yang benar-benar diterima.
 *
 * Server sudah mengirim ringkasan, tetapi editor menghitung ulang setelah
 * suntingan lokal, jadi aturannya harus satu. Nilai server dipakai hanya bila
 * bentuknya konsisten (total = materi + latihan).
 */
export function normalizeEModulSummary(
  raw: unknown,
  fallbackChapters: { sections: { kind: string }[] }[] = [],
): EModulSummary {
  const calculate = (): EModulSummary => {
    let materi = 0;
    let latihan = 0;
    for (const chapter of fallbackChapters) {
      for (const section of chapter.sections) {
        if (section.kind === "latihan") latihan += 1;
        else materi += 1;
      }
    }
    return {
      chapters: fallbackChapters.length,
      materi_sections: materi,
      latihan_sections: latihan,
      total_sections: materi + latihan,
    };
  };

  if (raw && typeof raw === "object") {
    const summary = raw as Record<string, unknown>;
    const parsed: EModulSummary = {
      chapters: num(summary.chapters),
      materi_sections: num(summary.materi_sections),
      latihan_sections: num(summary.latihan_sections),
      total_sections: num(summary.total_sections),
    };
    const totalsConsistent = parsed.total_sections === parsed.materi_sections + parsed.latihan_sections;
    if (totalsConsistent && parsed.chapters >= 0) {
      return parsed;
    }
  }

  return calculate();
}

/** Potong teks pertama sebagai judul ringkas (satu baris, maks `max` karakter). */
export function truncateForTitle(value: string, max = 80): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) {
    return flat;
  }
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
