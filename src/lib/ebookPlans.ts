/**
 * Perbandingan batasan E-Book antar paket langganan — murni tanpa I/O.
 *
 * Dipakai halaman paket untuk menampilkan tabel fitur E-Book: kolom pertama
 * Paket Dasar (tanpa E-Book), lalu satu kolom per paket premium.
 */

export type EbookLimitCell =
  | { kind: "check" }
  | { kind: "cross" }
  | { kind: "text"; text: string };

export interface EbookLimitRow {
  label: string;
  /** Satu sel per kolom, sejajar dengan `columns`. */
  cells: EbookLimitCell[];
}

export interface EbookComparison {
  columns: string[];
  rows: EbookLimitRow[];
}

export interface PremiumPlanInput {
  name: string;
  credits: number;
  duration_months: number | null;
}

const CHECK: EbookLimitCell = { kind: "check" };
const CROSS: EbookLimitCell = { kind: "cross" };

function text(value: string): EbookLimitCell {
  return { kind: "text", text: value };
}

export function buildEbookComparison(packages: PremiumPlanInput[]): EbookComparison {
  return {
    columns: ["Paket Dasar", ...packages.map((item) => item.name)],
    rows: [
      {
        label: "Akses E-Modul & bahan ajar",
        cells: [CROSS, ...packages.map(() => CHECK)],
      },
      {
        label: "Unduh PDF",
        cells: [CROSS, ...packages.map(() => CHECK)],
      },
      {
        label: "Unduh DOCX",
        cells: [CROSS, ...packages.map(() => CHECK)],
      },
      {
        label: "Kop identitas sekolah",
        cells: [CROSS, ...packages.map(() => CHECK)],
      },
      {
        label: "Batas unduhan",
        cells: [text("—"), ...packages.map(() => text("Tanpa batas"))],
      },
      {
        label: "Masa akses",
        cells: [
          text("—"),
          ...packages.map((item) =>
            text(item.duration_months ? `${item.duration_months} bulan` : "Selamanya")),
        ],
      },
      {
        label: "Kredit disertakan",
        cells: [
          text("10 (bonus awal)"),
          ...packages.map((item) => text(`${item.credits.toLocaleString("id-ID")} kredit`)),
        ],
      },
    ],
  };
}
