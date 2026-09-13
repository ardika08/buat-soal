import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  Tab,
  TabStopType,
  TextRun,
  WidthType,
} from "docx";
import type { ExamSession, Question } from "@/lib/api";

// A4 landscape usable width minus margins, per template
const COL_WIDTHS = [554, 2788, 2202, 1773, 2435, 1656, 1258, 1282];
const TABLE_HEADERS = [
  "No",
  "Capaian Pembelajaran",
  "Tujuan Pembelajaran",
  "Lingkup Materi",
  "Indikator",
  "Level Kognitif",
  "Tingkat Kesulitan",
  "Bentuk Soal",
];

const FONT = "Times New Roman";
const SIZE_BODY = 24; // 12pt
const SIZE_TITLE = 28; // 14pt
const FONT_OPTS = { font: FONT, size: SIZE_BODY } as const;

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const normalizePart = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildFilename = (exam: ExamSession) => {
  const parts = ["Kisi-Kisi"];

  if (exam.subject) parts.push(normalizePart(exam.subject));

  const classMatch = exam.class_phase.match(/Kelas\s+(\d+)/i);
  if (classMatch) parts.push(`Kelas-${classMatch[1]}`);

  if (exam.semester) parts.push(`Semester-${normalizePart(exam.semester)}`);

  return `${parts.join("-")}.docx`;
};

const inferJenjang = (classPhase: string) => {
  if (/fase\s*[ab]/i.test(classPhase)) return "Sekolah Dasar";
  if (/fase\s*c/i.test(classPhase)) return "Sekolah Menengah Pertama";
  if (/fase\s*d/i.test(classPhase)) return "Sekolah Menengah Atas";
  return "Sekolah Dasar";
};

// Indonesian academic year starts in July
const getAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
};

// "C2 - Memahami" -> ["C2", "(Memahami)"]
const splitCognitiveLevel = (level: string): [string, string] => {
  const parts = level.split(/\s*[-–:]\s*/);
  if (parts.length >= 2) {
    return [parts[0].trim(), `(${parts.slice(1).join(" ").trim()})`];
  }
  return [level.trim(), ""];
};

const countByType = (questions: Question[]) => {
  const counts = new Map<string, number>();
  for (const q of questions) {
    counts.set(q.question_type, (counts.get(q.question_type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count }));
};

const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;

const headerCell = (text: string, width: number) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: "center",
    margins: { marginUnitType: WidthType.DXA, top: 40, bottom: 40, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, ...FONT_OPTS })],
      }),
    ],
  });

const dataCell = (text: string, width: number, align: Align = AlignmentType.LEFT) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: "center",
    margins: { marginUnitType: WidthType.DXA, top: 30, bottom: 30, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text, ...FONT_OPTS })],
      }),
    ],
  });

const multiParaCell = (lines: string[], width: number, align: Align = AlignmentType.CENTER) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: "center",
    margins: { marginUnitType: WidthType.DXA, top: 30, bottom: 30, left: 60, right: 60 },
    children: lines.map(
      (line) =>
        new Paragraph({
          alignment: align,
          children: [new TextRun({ text: line, ...FONT_OPTS })],
        }),
    ),
  });

const emptyCell = (width: number) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { marginUnitType: WidthType.DXA, top: 30, bottom: 30, left: 60, right: 60 },
    children: [new Paragraph({ children: [] })],
  });

// Metadata layout uses tab stops: label | : value | right label | right value
const META_TAB_STOPS = [
  { type: TabStopType.LEFT, position: 2268 },
  { type: TabStopType.LEFT, position: 9639 },
  { type: TabStopType.LEFT, position: 11340 },
];

const metaParagraph = (segments: string[]) =>
  new Paragraph({
    tabStops: META_TAB_STOPS,
    children: [
      new TextRun({
        children: segments.flatMap((segment, index) =>
          index === 0 ? [segment] : [new Tab(), segment],
        ),
        ...FONT_OPTS,
      }),
    ],
  });

const spacer = () => new Paragraph({ children: [] });

export async function exportKisiKisiDocx(exam: ExamSession, questions: Question[]) {
  const topics = exam.topics ?? [];
  const typeCounts = countByType(questions);

  // --- Metadata: 4 segments per line (left label, left value, right label, right value) ---
  const metaLines: string[][] = [
    ["Jenjang Pendidikan", `: ${inferJenjang(exam.class_phase)}`, "Bentuk Soal", ":"],
  ];

  // Left side: subject / (gap) / curriculum / total — right side: count per question type
  const leftRows = [
    ["Mata Pelajaran", exam.subject],
    ["", ""],
    ["Kurikulum", exam.curriculum],
    ["Jumlah Soal", `${questions.length} Soal`],
  ];
  for (let i = 0; i < leftRows.length; i++) {
    const [label, value] = leftRows[i];
    const rightValue = typeCounts[i - 1]; // first right slot is taken by "Bentuk Soal:"
    metaLines.push([
      label,
      value ? `: ${value}` : "",
      "",
      rightValue ? `${rightValue.count} Soal (${rightValue.type})` : "",
    ]);
  }
  for (const tc of typeCounts.slice(leftRows.length - 1)) {
    metaLines.push(["", "", "", `${tc.count} Soal (${tc.type})`]);
  }

  // --- Kisi-kisi table ---
  const headerRow = new TableRow({
    tableHeader: true,
    height: { value: 700, rule: HeightRule.ATLEAST },
    children: TABLE_HEADERS.map((header, i) => headerCell(header, COL_WIDTHS[i])),
  });

  // Questions are not individually mapped to topics; distribute round-robin
  const dataRows = questions.map((question, index) => {
    const topic = topics.length > 0 ? topics[index % topics.length] : null;
    const [cogCode, cogLabel] = splitCognitiveLevel(question.cognitive_level ?? "");
    const indicator = (question.question_content ?? "").split("\n")[0].trim();

    return new TableRow({
      children: [
        dataCell(String(question.order_number), COL_WIDTHS[0], AlignmentType.CENTER),
        emptyCell(COL_WIDTHS[1]),
        dataCell(topic?.tujuan ?? "", COL_WIDTHS[2]),
        dataCell(topic?.topik ?? "", COL_WIDTHS[3]),
        dataCell(indicator, COL_WIDTHS[4]),
        multiParaCell(cogLabel ? [cogCode, cogLabel] : [cogCode], COL_WIDTHS[5]),
        dataCell(question.difficulty ?? "", COL_WIDTHS[6], AlignmentType.CENTER),
        dataCell(question.question_type ?? "", COL_WIDTHS[7], AlignmentType.CENTER),
      ],
    });
  });

  const kisiTable = new Table({
    width: { size: COL_WIDTHS.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: COL_WIDTHS,
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [headerRow, ...dataRows],
  });

  // --- Signature block ---
  const sigCell = (role: string) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: role, ...FONT_OPTS })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "(………………………………)", ...FONT_OPTS })],
        }),
      ],
    });

  const sigTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [sigCell("Kepala Sekolah"), sigCell("Guru Pembuat Soal")],
      }),
    ],
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE_BODY },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `KISI-KISI SOAL ${exam.exam_type.toUpperCase()}`,
                bold: true,
                ...FONT_OPTS,
                size: SIZE_TITLE,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `TAHUN PELAJARAN ${getAcademicYear()}`,
                bold: true,
                ...FONT_OPTS,
                size: SIZE_TITLE,
              }),
            ],
          }),
          spacer(),
          ...metaLines.map(metaParagraph),
          spacer(),
          kisiTable,
          spacer(),
          spacer(),
          new Paragraph({
            children: [new TextRun({ text: "Mengetahui,", ...FONT_OPTS })],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Jakarta, ………………………. ${new Date().getFullYear()}`, ...FONT_OPTS }),
            ],
          }),
          spacer(),
          sigTable,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveBlob(blob, buildFilename(exam));
}
