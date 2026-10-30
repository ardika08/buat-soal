/**
 * Penyusunan dokumen ekspor e-modul — murni tanpa I/O.
 *
 * Model dokumen (judul, metadata, blok teks) dipakai bersama oleh pembuat DOCX
 * dan PDF di Edge Function supaya isi kedua format selalu sama. Pembuat berkas
 * (docx/pdf-lib) ada di Edge Function; berkas ini hanya menyiapkan isinya.
 */

export type ExportBlockKind = "heading" | "subheading" | "paragraph";

export interface ExportBlock {
  kind: ExportBlockKind;
  text: string;
}

export interface EModulDocumentModel {
  title: string;
  metadata: string[];
  blocks: ExportBlock[];
  /** Nama berkas tanpa ekstensi. */
  filename: string;
  /** Kop identitas sekolah (bila diisi di pengaturan pengguna). */
  letterhead: EModulLetterhead | null;
  /** TATA LETAK dokumen (margin & ukuran huruf). */
  layout: EModulLayout;
}

export type EModulFontSize = "kecil" | "normal" | "besar";
export type EModulMargin = "sempit" | "normal" | "lebar";

export interface EModulLayout {
  font_size: EModulFontSize;
  margin: EModulMargin;
}

export const DEFAULT_EMODUL_LAYOUT: EModulLayout = {
  font_size: "normal",
  margin: "normal",
};

/** Baca opsi tata letak dari pengaturan; nilai asing kembali ke default. */
export function resolveEModulLayout(raw: unknown): EModulLayout {
  const source = (raw ?? {}) as { font_size?: unknown; margin?: unknown };

  return {
    font_size:
      source.font_size === "kecil" || source.font_size === "besar"
        ? source.font_size
        : "normal",
    margin:
      source.margin === "sempit" || source.margin === "lebar"
        ? source.margin
        : "normal",
  };
}

export interface EModulLetterhead {
  school_name: string;
  address: string;
  contact: string;
  headmaster: string;
  nip: string;
}

export interface SchoolSettingsInput {
  school_name?: unknown;
  address?: unknown;
  phone?: unknown;
  email?: unknown;
  headmaster?: unknown;
  nip?: unknown;
}

export interface ExportSectionInput {
  kind: "materi" | "latihan";
  title: string;
  content: string;
}

export interface ExportChapterInput {
  order_number: number;
  title: string;
  sections: ExportSectionInput[];
}

export interface ExportDraftInput {
  title: string;
  subject: string;
  class_phase: string;
  semester: string;
  topics: Array<{ topik: string; capaian: string }>;
  chapters: ExportChapterInput[];
}

export function buildEModulDocument(
  draft: ExportDraftInput,
  letterhead?: EModulLetterhead | null,
  layout?: EModulLayout | null,
): EModulDocumentModel {
  const title = draft.title.trim() || "E-Modul";

  const header = [
    draft.subject.trim(),
    draft.class_phase.trim(),
    draft.semester.trim() ? `Semester ${draft.semester.trim()}` : "",
  ].filter(Boolean).join(" · ");

  const metadata: string[] = header ? [header] : [];
  const topics = draft.topics.filter((topic) => topic.topik.trim());

  if (topics.length > 0) {
    metadata.push(`Topik: ${topics.map((topic) => topic.topik.trim()).join("; ")}`);

    for (const topic of topics) {
      if (topic.capaian.trim()) {
        metadata.push(`Capaian: ${topic.capaian.trim()}`);
      }
    }
  }

  const blocks: ExportBlock[] = [];

  for (const chapter of draft.chapters) {
    blocks.push({
      kind: "heading",
      text: chapter.title.trim() || `Bab ${chapter.order_number}`,
    });

    for (const section of chapter.sections) {
      blocks.push({
        kind: "subheading",
        text: section.title.trim() || (section.kind === "latihan" ? "Latihan" : "Subbab"),
      });

      if (section.content.trim()) {
        blocks.push({ kind: "paragraph", text: section.content.trim() });
      }
    }
  }

  return {
    title,
    metadata,
    blocks,
    filename: slugifyFilename(title),
    letterhead: letterhead ?? null,
    layout: layout ?? DEFAULT_EMODUL_LAYOUT,
  };
}

/**
 * Bentuk kop dari pengaturan pengguna. Mengembalikan `null` bila nama sekolah
 * belum diisi (kop tidak ditampilkan).
 */
export function buildEModulLetterhead(
  settings: SchoolSettingsInput | null | undefined,
): EModulLetterhead | null {
  const schoolName = text(settings?.school_name);

  if (!schoolName) {
    return null;
  }

  const contact = [settings?.phone, settings?.email]
    .map((value) => text(value))
    .filter(Boolean)
    .join(" · ");

  return {
    school_name: schoolName,
    address: text(settings?.address),
    contact,
    headmaster: text(settings?.headmaster),
    nip: text(settings?.nip),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Ubah judul menjadi nama berkas yang aman. */
export function slugifyFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    // Pemisah (titik dua, garis miring, tanda baca) dijadikan spasi agar kata
    // tidak menempel: "IPA/Bab" -> "ipa bab".
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  return slug || "e-modul";
}

/**
 * Font standar PDF (WinAnsi) tidak mendukung semua karakter tipografis.
 * Ganti karakter umum dengan padanan ASCII dan buang sisanya.
 */
export function sanitizePdfText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00b7/g, "-")
    .replace(/\u00d7/g, "x")
    .replace(/\t/g, "  ")
    .replace(/\r?\n/g, " ")
    // Sisakan hanya karakter printable Latin-1 (font standar PDF).
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
}
