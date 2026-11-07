/**
 * Kontrak keluaran generator e-modul — murni tanpa I/O.
 *
 * Dipakai bersama oleh service generate (Edge Function) dan tes: prompt, JSON
 * schema, normalisasi keluaran AI, validasi payload, serta biaya kredit tinggal
 * di sini supaya aturannya hanya ada satu.
 */

export interface GenerateEModulPayload {
  topics: Array<{ topik: string; capaian: string }>;
  fase: string;
  kelas: string;
  subject: string;
  semester: string;
  chapters: number;
  sub_chapters: number;
  exercise_share: number;
}

export interface EModulSectionOutput {
  order_number: number;
  kind: "materi" | "latihan";
  title: string;
  content: string;
}

export interface EModulChapterOutput {
  order_number: number;
  title: string;
  sections: EModulSectionOutput[];
}

export interface EModulOutput {
  title: string;
  chapters: EModulChapterOutput[];
}

export const EMODUL_MIN_CHAPTERS = 1;
export const EMODUL_MAX_CHAPTERS = 12;
export const EMODUL_MIN_SUBCHAPTERS = 1;
export const EMODUL_MAX_SUBCHAPTERS = 6;
export const EMODUL_MAX_EXERCISE_SHARE = 60;

/** Biaya sementara: 1 kredit per subbab (aturan final ditetapkan server). */
export const EMODUL_CREDIT_PER_SUBBAB = 1;

export function emodulCreditCost(payload: GenerateEModulPayload): number {
  const cost = Number(payload.topics?.length) * Number(payload.sub_chapters) * EMODUL_CREDIT_PER_SUBBAB;
  return Number.isFinite(cost) ? Math.max(1, Math.trunc(cost)) : 1;
}

export function validateGeneratePayload(payload: GenerateEModulPayload): string | null {
  if (!payload || typeof payload !== "object") {
    return "Payload tidak valid.";
  }

  if (!Array.isArray(payload.topics) || payload.topics.length === 0) {
    return "Minimal satu topik wajib diisi.";
  }

  if (payload.topics.some((topic) => !text(topic?.topik) || !text(topic?.capaian))) {
    return "Topik dan capaian pembelajaran wajib diisi.";
  }

  for (const field of ["fase", "kelas", "subject", "semester"] as const) {
    if (!text(payload[field])) {
      return `Field ${field} wajib diisi.`;
    }
  }

  if (payload.topics.length > EMODUL_MAX_CHAPTERS) {
    return `Jumlah materi maksimal ${EMODUL_MAX_CHAPTERS}.`;
  }

  if (payload.chapters !== payload.topics.length) {
    return "Jumlah bab harus sama dengan jumlah materi.";
  }

  if (
    !Number.isInteger(payload.sub_chapters) ||
    payload.sub_chapters < EMODUL_MIN_SUBCHAPTERS ||
    payload.sub_chapters > EMODUL_MAX_SUBCHAPTERS
  ) {
    return `Jumlah subbab per bab harus antara ${EMODUL_MIN_SUBCHAPTERS} dan ${EMODUL_MAX_SUBCHAPTERS}.`;
  }

  if (
    !Number.isFinite(Number(payload.exercise_share)) ||
    Number(payload.exercise_share) < 0 ||
    Number(payload.exercise_share) > EMODUL_MAX_EXERCISE_SHARE
  ) {
    return `Porsi latihan harus antara 0 dan ${EMODUL_MAX_EXERCISE_SHARE}%.`;
  }

  return null;
}

/** Perkiraan jumlah latihan per bab dari porsi latihan. */
export function exercisesPerChapter(payload: GenerateEModulPayload): number {
  const share = Number(payload.exercise_share) || 0;
  const subChapters = Number(payload.sub_chapters) || 0;
  return Math.min(subChapters, Math.max(0, Math.round((subChapters * share) / 100)));
}

export function buildEModulPrompt(payload: GenerateEModulPayload): string {
  const topicList = payload.topics
    .map((topic, index) => `${index + 1}. Topik: ${topic.topik.trim()}. Capaian: ${topic.capaian.trim()}`)
    .join("\n");

  return JSON.stringify({
    instruction:
      "Susun e-book bahan ajar Bahasa Indonesia untuk Kurikulum Merdeka dengan pendekatan pembelajaran mendalam (deep learning: berkesadaran, bermakna, menggembirakan). " +
      "Buat tepat satu BAB untuk setiap materi input, urutannya harus sama. Jangan menggabungkan atau menambah BAB. " +
      "Setiap BAB wajib memiliki bagian berurutan: Pertanyaan Pemantik, Peta Konsep (uraikan sebagai teks/relasi konsep), satu bagian induk Pendalaman Materi berjudul tepat 'A. Pendalaman Materi <nama topik>', tepat sebanyak submateri sesuai target, lalu Uji Capaian Pembelajaran berisi soal dan kunci/pedoman jawaban. " +
      "Judul submateri harus bernomor 1.1, 1.2, dan seterusnya; jangan menambah atau mengurangi submateri. Nomor 1.1 dan seterusnya hanya untuk submateri, bukan judul bagian induk. Simpan semua bagian tersebut sebagai bagian kind materi, kecuali Uji Capaian Pembelajaran sebagai kind latihan. " +
      "Sesuaikan nama dan isi submateri dengan karakter mapel/topik, tetapi jumlahnya harus tepat sesuai target. " +
      "Gunakan tujuan pembelajaran materi terkait sebagai acuan isi BAB tersebut. Pastikan akurat, runtut, sesuai usia, inklusif, dan tidak mengarang CP resmi. " +
      "Bagian sampul dan daftar isi dibuat oleh aplikasi; jangan keluarkan sebagai BAB. Kembalikan hanya JSON valid sesuai schema.",
    fase: payload.fase,
    kelas: payload.kelas,
    subject: payload.subject,
    semester: payload.semester,
    jumlah_bab: payload.topics.length,
    aturan_bab: "Satu topik/materi input = tepat satu bab, mengikuti urutan input.",
    jumlah_submateri_per_bab: payload.sub_chapters,
    aturan_submateri: `Setiap BAB harus memiliki tepat ${payload.sub_chapters} submateri di dalam Pendalaman Materi. Judul induk harus diawali 'A. Pendalaman Materi' dan tidak dihitung sebagai submateri. Nomori submateri 1.1 sampai 1.${payload.sub_chapters}.`,
    porsi_latihan_persen: payload.exercise_share,
    latihan_per_bab: exercisesPerChapter(payload),
    topics: topicList,
    json_shape: {
      title: "Judul e-modul",
      chapters: [
        {
          title: "Bab 1: Judul bab",
          sections: [
            { kind: "materi", title: "Pertanyaan Pemantik", content: "Pertanyaan kontekstual." },
            { kind: "materi", title: "Peta Konsep", content: "Relasi konsep." },
            { kind: "materi", title: "A. Pendalaman Materi Ekosistem", content: "Pengantar pendalaman." },
            { kind: "materi", title: "1.1 Komponen Ekosistem", content: "Uraian submateri." },
            { kind: "materi", title: "1.2 Interaksi Ekosistem", content: "Uraian submateri." },
            { kind: "latihan", title: "Uji Capaian Pembelajaran", content: "Soal dan pedoman jawaban." },
          ],
        },
      ],
    },
  });
}

export function emodulSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "chapters"],
    properties: {
      title: { type: "string" },
      chapters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "sections"],
          properties: {
            title: { type: "string" },
            sections: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["kind", "title", "content"],
                properties: {
                  kind: { type: "string", enum: ["materi", "latihan"] },
                  title: { type: "string" },
                  content: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
}

/**
 * Normalisasi + validasi dasar keluaran AI.
 *
 * Merapikan teks, membuang bagian kosong, dan menomori ulang bab/bagian.
 */
export function normalizeEModulOutput(raw: unknown, payload: GenerateEModulPayload): EModulOutput {
  const source = raw as { title?: unknown; chapters?: unknown } | null;

  if (!source || !Array.isArray(source.chapters) || source.chapters.length === 0) {
    throw new Error("Output AI tidak memuat bab.");
  }

  const chapters: EModulChapterOutput[] = source.chapters.map((rawChapter, chapterIndex) => {
    const chapter = rawChapter as { title?: unknown; sections?: unknown } | null;
    const chapterTitle = text(chapter?.title);

    if (!chapterTitle) {
      throw new Error(`Bab ${chapterIndex + 1} tidak punya judul.`);
    }
    if (!Array.isArray(chapter?.sections)) {
      throw new Error(`Bab ${chapterIndex + 1} tidak punya bagian.`);
    }

    const sections: EModulSectionOutput[] = [];

    for (const rawSection of chapter.sections) {
      const section = rawSection as { kind?: unknown; title?: unknown; content?: unknown } | null;
      const kind = section?.kind === "latihan"
        ? "latihan"
        : section?.kind === "materi"
          ? "materi"
          : null;

      if (!kind) {
        throw new Error(`Jenis bagian pada bab ${chapterIndex + 1} tidak dikenal.`);
      }

      const rawSectionTitle = text(section?.title);
      const sectionTitle = normalizeSectionTitle(rawSectionTitle, payload, chapterIndex);
      const content = text(section?.content);

      // Bagian tanpa judul/isi dibuang; kelengkapan divalidasi terpisah.
      if (!sectionTitle || !content) {
        continue;
      }

      sections.push({
        order_number: sections.length + 1,
        kind,
        title: sectionTitle,
        content,
      });
    }

    if (sections.length === 0) {
      throw new Error(`Bab ${chapterIndex + 1} tidak punya bagian berisi.`);
    }

    return {
      order_number: chapterIndex + 1,
      title: chapterTitle,
      sections,
    };
  });

  return {
    title: text(source.title) || text(payload.topics[0]?.topik) || "E-Modul Baru",
    chapters,
  };
}

function normalizeSectionTitle(title: string, payload: GenerateEModulPayload, chapterIndex: number): string {
  if (!/^\s*(?:[a-z]\.\s*)?pendalaman materi\b/i.test(title)) return title;
  const topic = payload.topics[chapterIndex]?.topik?.trim();
  return topic ? `A. Pendalaman Materi ${topic}` : `A. Pendalaman Materi`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface CompletenessCheck {
  ok: boolean;
  reason: string | null;
}

/** Biaya regenerasi satu bagian (mengikuti pola regenerasi soal). */
export const EMODUL_REGENERATE_COST = 1;

export interface RegenerateSectionInput {
  subject: string;
  fase: string;
  kelas: string;
  semester: string;
  module_title: string;
  chapter_title: string;
  kind: "materi" | "latihan";
  title: string;
  current_content: string;
  instruction?: string;
}

export function buildRegenerateSectionPrompt(input: RegenerateSectionInput): string {
  return JSON.stringify({
    instruction:
      input.kind === "latihan"
        ? "Tulis ulang latihan berikut untuk e-modul. Pertahankan jenisnya; buat soal/aktivitas yang jelas dan sesuai konteks. Gunakan Bahasa Indonesia formal. Kembalikan hanya JSON valid sesuai schema."
        : "Tulis ulang uraian materi berikut untuk e-modul. Pertahankan konteks dan cakupannya; buat uraian runtut, akurat, dan aplikatif. Gunakan Bahasa Indonesia formal. Kembalikan hanya JSON valid sesuai schema.",
    subject: input.subject,
    fase: input.fase,
    kelas: input.kelas,
    semester: input.semester,
    judul_modul: input.module_title,
    judul_bab: input.chapter_title,
    jenis_bagian: input.kind,
    judul_bagian: input.title,
    teks_sekarang: input.current_content,
    instruksi_tambahan: input.instruction?.trim() || null,
    json_shape: { content: "Teks hasil tulis ulang." },
  });
}

export function regenerateSectionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["content"],
    properties: {
      content: { type: "string" },
    },
  };
}

/** Ambil isi hasil regenerasi; wajib tidak kosong. */
export function normalizeRegeneratedSection(raw: unknown): string {
  const content = text((raw as { content?: unknown } | null)?.content);

  if (!content) {
    throw new Error("Output AI tidak memuat isi bagian.");
  }

  return content;
}

/**
 * Validasi kelengkapan keluaran AI terhadap permintaan guru.
 *
 * Berbeda dari normalisasi (yang hanya merapikan bentuk), pemeriksaan ini
 * memastikan jumlah bab, jumlah bagian per bab, dan porsi latihan benar-benar
 * sesuai konfigurasi wizard. Bila tidak lengkap, pemanggil mengulang sekali,
 * lalu mengembalikan kredit pemakaian bila tetap gagal.
 */
export function validateEModulCompleteness(
  output: EModulOutput,
  payload: GenerateEModulPayload,
): CompletenessCheck {
  const expectedChapters = Number(payload.chapters);
  if (output.chapters.length !== expectedChapters || expectedChapters !== payload.topics.length) {
    return {
      ok: false,
      reason: `Jumlah bab tidak sesuai: diminta ${expectedChapters}, dihasilkan ${output.chapters.length}.`,
    };
  }

  for (const chapter of output.chapters) {
    const materialTitles = chapter.sections
      .filter((section) => section.kind === "materi")
      .map((section) => section.title.toLocaleLowerCase("id"));
    const exerciseTitles = chapter.sections
      .filter((section) => section.kind === "latihan")
      .map((section) => section.title.toLocaleLowerCase("id"));
    const requiredMaterialParts = ["pertanyaan pemantik", "peta konsep"];

    for (const required of requiredMaterialParts) {
      if (!materialTitles.some((title) => title.includes(required))) {
        return { ok: false, reason: `"${chapter.title}" belum memiliki bagian ${required}.` };
      }
    }

    const depthTitles = materialTitles.filter((title) => title.includes("pendalaman materi"));
    if (depthTitles.length !== 1 || !/^a\.\s*pendalaman materi\b/.test(depthTitles[0] ?? "")) {
      return { ok: false, reason: `"${chapter.title}" harus memiliki satu judul induk "A. Pendalaman Materi <nama topik>".` };
    }

    const subsectionCount = materialTitles.filter((title) => /^\d+\.\d+\s+\S/.test(title)).length;
    if (subsectionCount !== payload.sub_chapters) {
      return { ok: false, reason: `"${chapter.title}" harus memiliki tepat ${payload.sub_chapters} submateri bernomor; dihasilkan ${subsectionCount}.` };
    }

    if (!exerciseTitles.some((title) => title.includes("uji capaian pembelajaran"))) {
      return { ok: false, reason: `"${chapter.title}" belum memiliki Uji Capaian Pembelajaran.` };
    }
  }

  return { ok: true, reason: null };
}
