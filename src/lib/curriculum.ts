/**
 * Pilihan kurikulum yang dipakai bersama wizard Soal dan wizard E-Modul.
 *
 * Dipusatkan di sini supaya daftar fase, mata pelajaran, dan kelas hanya ada di
 * satu tempat — menambah/mengubah mapel cukup di berkas ini.
 */

export const FASE_OPTIONS = ["Fase A", "Fase B", "Fase C", "Fase D", "Fase E", "Fase F"] as const;

export type Fase = (typeof FASE_OPTIONS)[number];

export const SUBJECT_OPTIONS_BY_FASE: Record<string, string[]> = {
  "Fase A": ["Bahasa Indonesia", "Matematika", "PAI", "Bahasa Inggris", "PJOK", "PKN", "SBDP", "Seni Rupa", "Muatan Lokal"],
  "Fase B": ["Bahasa Indonesia", "Matematika", "IPAS", "PAI", "Bahasa Inggris", "PJOK", "PKN", "SBDP", "Seni Rupa"],
  "Fase C": ["Bahasa Indonesia", "Matematika", "PAI", "Bahasa Inggris", "SBDP", "IPAS", "PJOK", "PKN"],
  "Fase D": ["Bahasa Indonesia", "Matematika", "PAI", "Bahasa Inggris", "PJOK", "PKN", "Seni Budaya", "Informatika", "Muatan Lokal"],
  "Fase E": ["Bahasa Indonesia", "Matematika", "PAI", "Bahasa Inggris", "PJOK", "PKN", "IPA", "IPS", "Informatika", "Bahasa & Budaya", "Seni Budaya"],
  "Fase F": ["Bahasa Indonesia", "Matematika", "PAI", "Bahasa Inggris", "PJOK", "PKN", "IPA", "IPS", "Informatika", "Bahasa & Budaya", "Seni Budaya"],
};

export const KELAS_OPTIONS_BY_FASE: Record<string, number[]> = {
  "Fase A": [1, 2],
  "Fase B": [3, 4],
  "Fase C": [5, 6],
  "Fase D": [7, 8, 9],
  "Fase E": [10],
  "Fase F": [11, 12],
};

export const SEMESTER_OPTIONS = ["Ganjil", "Genap"] as const;
