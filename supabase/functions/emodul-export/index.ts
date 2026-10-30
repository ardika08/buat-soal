// Ekspor e-modul ke PDF atau DOCX.
//
// POST { e_modul_id, format: "pdf" | "docx" } → memuat draf + kop/tata letak
// tersimpan, menyusun model dokumen, lalu merender berkas dan mengembalikannya
// sebagai base64.
//
// Sesi dijaga `requireUser`. Pemeriksaan entitlement unduhan dilakukan pada
// endpoint terpisah.

import { Document, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from "npm:docx@9.7.1";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { resolveEbookEntitlement } from "../_shared/entitlement.ts";
import {
  buildEModulDocument,
  buildEModulLetterhead,
  resolveEModulLayout,
  sanitizePdfText,
  type EModulDocumentModel,
  type ExportDraftInput,
  type SchoolSettingsInput,
} from "../_shared/emodul-export.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface ExportRequest {
  e_modul_id?: number | string;
  format?: string;
}

interface SectionRow {
  id: number;
  chapter_id: number;
  order_number: number;
  kind: string;
  title: string;
  content: string;
}

interface ChapterRow {
  id: number;
  order_number: number;
  title: string;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) {
    return options;
  }

  try {
    const auth = await requireUser(request);
    if ("response" in auth) {
      return auth.response;
    }

    const admin = createAdminClient();
    const body = await request.json().catch(() => ({})) as ExportRequest;
    const eModulId = Number(body.e_modul_id);
    const format = body.format;

    if (!Number.isInteger(eModulId) || eModulId <= 0) {
      return jsonResponse({ message: "e_modul_id tidak valid." }, 422);
    }
    if (format !== "pdf" && format !== "docx") {
      return jsonResponse({ message: "Format harus 'pdf' atau 'docx'." }, 422);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, subscription_tier, subscription_expiry")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    // Unduhan E-Modul dibundel ke langganan: butuh akses Premium.
    const entitlement = resolveEbookEntitlement(profile);
    if (!entitlement.entitled) {
      return jsonResponse({
        error: "upgrade_required",
        message: "Unduhan E-Modul tersedia untuk paket Premium.",
        entitlement,
      }, 402);
    }

    const { data: session, error: sessionError } = await admin
      .from("e_modul_sessions")
      .select("id, title, subject, fase, kelas, semester, topics")
      .eq("id", eModulId)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (sessionError) {
      throw sessionError;
    }
    if (!session) {
      return jsonResponse({ message: "Draf e-modul tidak ditemukan." }, 404);
    }

    const { data: chapterRows, error: chapterError } = await admin
      .from("e_modul_chapters")
      .select("id, order_number, title")
      .eq("e_modul_id", eModulId)
      .order("order_number", { ascending: true });

    if (chapterError) {
      throw chapterError;
    }

    const chapterIds = (chapterRows ?? []).map((chapter: ChapterRow) => chapter.id);
    let sectionRows: SectionRow[] = [];

    if (chapterIds.length > 0) {
      const { data: sections, error: sectionError } = await admin
        .from("e_modul_sections")
        .select("id, chapter_id, order_number, kind, title, content")
        .in("chapter_id", chapterIds)
        .order("order_number", { ascending: true });

      if (sectionError) {
        throw sectionError;
      }

      sectionRows = sections ?? [];
    }

    const topics = Array.isArray(session.topics)
      ? (session.topics as Array<{ topik?: unknown; capaian?: unknown }>).map((topic) => ({
        topik: typeof topic?.topik === "string" ? topic.topik : "",
        capaian: typeof topic?.capaian === "string" ? topic.capaian : "",
      }))
      : [];

    const draft: ExportDraftInput = {
      title: session.title ?? "",
      subject: session.subject ?? "",
      class_phase: [session.fase, session.kelas].filter(Boolean).join(" - "),
      semester: session.semester ?? "",
      topics,
      chapters: (chapterRows ?? []).map((chapter: ChapterRow) => ({
        order_number: Number(chapter.order_number),
        title: chapter.title,
        sections: sectionRows
          .filter((section) => Number(section.chapter_id) === Number(chapter.id))
          .map((section) => ({
            kind: section.kind === "latihan" ? "latihan" : "materi",
            title: section.title,
            content: section.content,
          })),
      })),
    };

    const { data: settings } = await admin.rpc("get_emodul_settings", {
      p_user_id: profile.id,
    });
    const letterhead = buildEModulLetterhead(settings as SchoolSettingsInput);
    const layout = resolveEModulLayout((settings as { layout?: unknown } | null)?.layout);

    const model = buildEModulDocument(draft, letterhead, layout);
    const contentBase64 = format === "docx" ? await buildDocx(model) : await buildPdf(model);

    return jsonResponse({
      format,
      filename: `${model.filename}.${format}`,
      mime_type: format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf",
      content_base64: contentBase64,
    });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal mengekspor e-modul.",
    }, 500);
  }
});

async function buildDocx(model: EModulDocumentModel): Promise<string> {
  const children = [];

  // Tata letak: margin halaman (twips) & ukuran huruf isi (half-points).
  const sectionMargin = model.layout.margin === "sempit"
    ? { top: 720, right: 720, bottom: 720, left: 720 }
    : model.layout.margin === "lebar"
      ? { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      : { top: 1134, right: 1134, bottom: 1134, left: 1134 };
  const bodySize = model.layout.font_size === "kecil"
    ? 20
    : model.layout.font_size === "besar"
      ? 26
      : 22;

  // Kop identitas sekolah
  if (model.letterhead) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: model.letterhead.school_name.toUpperCase(), bold: true, size: 30 }),
        ],
      }),
    );

    if (model.letterhead.address) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: model.letterhead.address, size: 18 })],
        }),
      );
    }

    if (model.letterhead.contact) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: model.letterhead.contact, size: 18 })],
        }),
      );
    }

    children.push(
      new Paragraph({
        border: {
          bottom: { style: BorderStyle.DOUBLE, size: 6, color: "333333", space: 1 },
        },
        children: [],
      }),
      new Paragraph(""),
    );
  }

  children.push(
    new Paragraph({
      text: model.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    ...model.metadata.map((line) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: line, italics: true })],
      })
    ),
    new Paragraph(""),
  );

  for (const block of model.blocks) {
    if (block.kind === "heading") {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 }));
      continue;
    }

    if (block.kind === "subheading") {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 }));
      continue;
    }

    const paragraphs = block.text.split(/\r?\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: paragraph, size: bodySize })],
        }),
      );
    }
  }

  // Tanda tangan kepala sekolah
  if (model.letterhead && (model.letterhead.headmaster || model.letterhead.nip)) {
    children.push(
      new Paragraph({ text: "", spacing: { before: 400 } }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun("Kepala Sekolah")],
      }),
      new Paragraph(""),
      new Paragraph(""),
    );

    if (model.letterhead.headmaster) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: model.letterhead.headmaster, bold: true })],
        }),
      );
    }

    if (model.letterhead.nip) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `NIP. ${model.letterhead.nip}` })],
        }),
      );
    }
  }

  const document = new Document({
    sections: [{ properties: { page: { margin: sectionMargin } }, children }],
  });
  return Packer.toBase64String(document);
}

async function buildPdf(model: EModulDocumentModel): Promise<string> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = model.layout.margin === "sempit"
    ? 36
    : model.layout.margin === "lebar"
      ? 64
      : 48;
  const bodySize = model.layout.font_size === "kecil"
    ? 10
    : model.layout.font_size === "besar"
      ? 13
      : 11;
  const maxWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const write = (value: string, size: number, font: PDFFont, gap: number, centered = false) => {
    const lines = wrapText(sanitizePdfText(value), font, size, maxWidth);

    for (const line of lines) {
      ensureSpace(gap);
      const width = font.widthOfTextAtSize(line, size);
      const x = centered ? (pageWidth - width) / 2 : margin;
      page.drawText(line, { x, y: y - size, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= gap;
    }
  };

  const writeParagraphs = (value: string, size: number, font: PDFFont) => {
    const paragraphs = value.split(/\r?\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      write(paragraph, size, font, size * 1.4);
    }
  };

  // Kop identitas sekolah
  if (model.letterhead) {
    write(model.letterhead.school_name.toUpperCase(), 15, bold, 8, true);

    if (model.letterhead.address) {
      write(model.letterhead.address, 9, regular, 5, true);
    }
    if (model.letterhead.contact) {
      write(model.letterhead.contact, 9, regular, 5, true);
    }

    y -= 4;
    ensureSpace(2);
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.8,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawLine({
      start: { x: margin, y: y - 1 },
      end: { x: pageWidth - margin, y: y - 1 },
      thickness: 0.3,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;
  }

  // Judul & metadata
  write(model.title, 20, bold, 9, true);
  for (const line of model.metadata) {
    write(line, 10, regular, 5, true);
  }
  y -= 6;

  // Blok isi
  for (const block of model.blocks) {
    if (block.kind === "heading") {
      write(block.text, 15, bold, 7);
    } else if (block.kind === "subheading") {
      write(block.text, 12, bold, 6);
    } else {
      writeParagraphs(block.text, bodySize, regular);
    }
    y -= 2;
  }

  // Tanda tangan kepala sekolah
  if (model.letterhead && (model.letterhead.headmaster || model.letterhead.nip)) {
    const blockWidth = 70;
    const centerX = pageWidth - margin - blockWidth / 2;

    ensureSpace(60);
    y -= 12;

    const writeAt = (value: string, size: number, font: PDFFont) => {
      const safe = sanitizePdfText(value);
      const width = font.widthOfTextAtSize(safe, size);
      page.drawText(safe, {
        x: centerX - width / 2,
        y: y - size,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    };

    writeAt("Kepala Sekolah", 10, regular);
    y -= 24;

    if (model.letterhead.headmaster) {
      writeAt(model.letterhead.headmaster, 10, bold);
      y -= 6;
    }

    if (model.letterhead.nip) {
      writeAt(`NIP. ${model.letterhead.nip}`, 9, regular);
    }
  }

  const bytes = await pdf.save();
  return bytesToBase64(bytes);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}
