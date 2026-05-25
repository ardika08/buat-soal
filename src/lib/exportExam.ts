import jsPDF from "jspdf";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { type ExamSession, type Question } from "@/lib/api";

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const normalizeFilenamePart = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

const examTypeCode = (examType: string) => {
  const match = examType.match(/\(([^)]+)\)/);

  return normalizeFilenamePart(match?.[1] ?? examType);
};

const filename = (exam: ExamSession, extension: string) =>
  [
    "SOAL",
    examTypeCode(exam.exam_type),
    normalizeFilenamePart(exam.class_phase),
    normalizeFilenamePart(exam.semester),
  ].filter(Boolean).join("_") + `.${extension}`;

const optionLines = (question: Question) =>
  question.options
    ? Object.entries(question.options).map(([key, value]) => `${key}. ${value}`)
    : [];

const multipleChoiceInstruction = (pgOptions: string | null) => {
  if (pgOptions?.includes("(A-C)")) {
    return "Pilihlah satu jawaban yang paling tepat pada pilihan A, B, dan C di bawah ini.";
  }

  if (pgOptions?.includes("(A-D)")) {
    return "Pilihlah satu jawaban yang paling tepat pada pilihan A, B, C, dan D di bawah ini.";
  }

  return "Pilihlah satu jawaban yang paling tepat pada pilihan A, B, C, D, atau E di bawah ini.";
};

const sectionInstructionByType = (questionType: string, pgOptions: string | null) => {
  if (questionType === "Pilihan Ganda") {
    return {
      heading: "I. Pilihan Ganda",
      instruction: multipleChoiceInstruction(pgOptions),
    };
  }

  if (questionType === "Isian Singkat") {
    return {
      heading: "II. Isian",
      instruction: "Isilah titik-titik berikut dengan jawaban yang benar.",
    };
  }

  if (questionType === "Uraian") {
    return {
      heading: "III. Uraian",
      instruction: "Jawablah pertanyaan berikut dengan jawaban yang benar dan jelas.",
    };
  }

  return null;
};

const ILLUSTRATION_SIZE_MM = 30;
const ILLUSTRATION_SIZE_PX = 113;

const dataUrlToBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

const blobToDataUrl = async (blob: Blob) =>
  await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const imageToDataUrl = async (question: Question) => {
  const imageUrl = question.illustration_image;

  if (!imageUrl) {
    throw new Error("Missing illustration image.");
  }

  if (imageUrl.startsWith("data:")) {
    return imageUrl;
  }

  const response = await fetch(imageUrl, { mode: "cors" });

  if (!response.ok) {
    throw new Error("Illustration image could not be loaded.");
  }

  return await blobToDataUrl(await response.blob());
};

export async function exportExamPdf(exam: ExamSession, questions: Question[]) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const maxWidth = pageWidth - margin * 2;
  let y = 16;

  const addPageIfNeeded = (height = 8) => {
    if (y + height > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const addText = (text: string, size = 10, style: "normal" | "bold" = "normal", gap = 5) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, maxWidth);
    lines.forEach((line: string) => {
      addPageIfNeeded(gap);
      pdf.text(line, margin, y);
      y += gap;
    });
  };

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(exam.exam_type.toUpperCase(), pageWidth / 2, y, { align: "center" });
  y += 8;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  [
    `Mata Pelajaran: ${exam.subject}`,
    `Fase / Kelas: ${exam.class_phase}`,
    `Semester: ${exam.semester}`,
    `Alokasi Waktu: ${exam.time_allocation} menit`,
    `Kurikulum: ${exam.curriculum}`,
  ].forEach((line) => {
    pdf.text(line, margin, y);
    y += 5;
  });

  y += 4;
  pdf.line(margin, y, pageWidth - margin, y);
  y += 8;

  const renderedSections = new Set<string>();
  for (const [index, question] of questions.entries()) {
    const section = sectionInstructionByType(question.question_type, exam.pg_options);
    if (section && !renderedSections.has(question.question_type)) {
      addText(section.heading, 11, "bold", 6);
      addText(section.instruction, 10, "normal", 5);
      renderedSections.add(question.question_type);
      y += 2;
    }

    addText(`${index + 1}. ${question.question_content}`, 10, "normal", 5);
    optionLines(question).forEach((line) => addText(`   ${line}`, 10, "normal", 5));
    if (question.illustration_image) {
      try {
        addPageIfNeeded(ILLUSTRATION_SIZE_MM + 6);
        pdf.addImage(await imageToDataUrl(question), "PNG", margin, y, ILLUSTRATION_SIZE_MM, ILLUSTRATION_SIZE_MM);
        y += ILLUSTRATION_SIZE_MM + 4;
      } catch {
        addText(`Ilustrasi: ${question.illustration_prompt ?? "gambar tidak dapat dimuat"}`, 9, "normal", 5);
      }
    }
    y += 2;
  }

  pdf.addPage();
  y = margin;
  addText("KUNCI JAWABAN", 13, "bold", 7);
  questions.forEach((question, index) => {
    addText(`${index + 1}. ${question.correct_answer}`, 10, "normal", 5);
  });

  pdf.save(filename(exam, "pdf"));
}

export async function exportExamDocx(exam: ExamSession, questions: Question[]) {
  const metaRows = [
    ["Mata Pelajaran", exam.subject],
    ["Fase / Kelas", exam.class_phase],
    ["Semester", exam.semester],
    ["Alokasi Waktu", `${exam.time_allocation} menit`],
    ["Kurikulum", exam.curriculum],
  ];

  const renderedSections = new Set<string>();
  const questionParagraphGroups = await Promise.all(questions.map(async (question, index) => {
    const blocks: Paragraph[] = [];
    const section = sectionInstructionByType(question.question_type, exam.pg_options);

    if (section && !renderedSections.has(question.question_type)) {
      blocks.push(
        new Paragraph({
          text: section.heading,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 220, after: 120 },
        }),
        new Paragraph({
          text: section.instruction,
          spacing: { after: 120 },
        }),
      );
      renderedSections.add(question.question_type);
    }

    blocks.push(
      new Paragraph({
        spacing: { before: 160 },
        children: [
          new TextRun({ text: `${index + 1}. `, bold: true }),
          new TextRun(question.question_content),
        ],
      }),
      ...optionLines(question).map((line) => new Paragraph({ text: `   ${line}` })),
    );

    if (question.illustration_image) {
      try {
        blocks.push(
          new Paragraph({
            spacing: { before: 120, after: 120 },
            children: [
              new ImageRun({
                type: "png",
                data: dataUrlToBytes(await imageToDataUrl(question)),
                transformation: {
                  width: ILLUSTRATION_SIZE_PX,
                  height: ILLUSTRATION_SIZE_PX,
                },
              }),
            ],
          }),
        );
      } catch {
        if (question.illustration_prompt) {
          blocks.push(new Paragraph({ text: `Ilustrasi: ${question.illustration_prompt}` }));
        }
      }
    }

    return blocks;
  }));
  const questionParagraphs = questionParagraphGroups.flat();

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: exam.exam_type.toUpperCase(),
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: metaRows.map(([label, value]) =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph(value)] }),
                ],
              }),
            ),
          }),
          new Paragraph(""),
          new Paragraph({ text: "DAFTAR SOAL", heading: HeadingLevel.HEADING_1 }),
          ...questionParagraphs,
          new Paragraph(""),
          new Paragraph({ text: "KUNCI JAWABAN", heading: HeadingLevel.HEADING_1 }),
          ...questions.map((question, index) =>
            new Paragraph(`${index + 1}. ${question.correct_answer}`),
          ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveBlob(blob, filename(exam, "docx"));
}
