/**
 * Titik masuk untuk memulai draf baru dari beranda.
 *
 * Pemetaan jenis draf -> alamat halaman disimpan di server supaya alamat modul
 * bisa berubah tanpa merilis ulang frontend. Murni tanpa I/O agar bisa diuji.
 */

export type DraftType = "exam" | "e_modul";

export interface StartTarget {
  type: DraftType;
  redirect_url: string;
}

const START_TARGETS: Record<DraftType, string> = {
  exam: "/generate",
  e_modul: "/e-modul/baru",
};

export function isDraftType(value: unknown): value is DraftType {
  return value === "exam" || value === "e_modul";
}

export function resolveStartTarget(type: DraftType): StartTarget {
  return {
    type,
    redirect_url: START_TARGETS[type],
  };
}
