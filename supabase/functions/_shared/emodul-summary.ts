/**
 * Ringkasan isi e-modul — murni tanpa I/O.
 *
 * Dipakai endpoint detail editor supaya klien tidak perlu menghitung ulang
 * jumlah bab/subbab/latihan, dan angkanya konsisten dengan struktur tersimpan.
 */

export interface SummarizableSection {
  kind: "materi" | "latihan";
}

export interface SummarizableChapter {
  sections: SummarizableSection[];
}

export interface EModulSummary {
  chapters: number;
  materi_sections: number;
  latihan_sections: number;
  total_sections: number;
}

export function summarizeEModul(chapters: SummarizableChapter[]): EModulSummary {
  let materi = 0;
  let latihan = 0;

  for (const chapter of chapters) {
    for (const section of chapter.sections) {
      if (section.kind === "latihan") {
        latihan += 1;
      } else {
        materi += 1;
      }
    }
  }

  return {
    chapters: chapters.length,
    materi_sections: materi,
    latihan_sections: latihan,
    total_sections: materi + latihan,
  };
}
