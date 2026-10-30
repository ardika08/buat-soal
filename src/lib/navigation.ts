import type { ComponentType } from "react";
import { BookOpen, Coins, FileText, History, Library, UserCircle } from "lucide-react";
import { EMODUL_NEW_PATH, EMODUL_PATH, PROFILE_PATH } from "@/lib/routes";

export interface SidebarItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** Penjelasan singkat; dipakai sebagai tooltip item menu. */
  description?: string;
  /** Awalan alamat untuk menandai item aktif (default: `to`). */
  activeMatch?: string;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

/**
 * Struktur menu samping workspace, dikelompokkan per alur kerja guru.
 *
 * Grup "Buat Materi" adalah pintasan mulai berkarya: "Soal" membuka wizard
 * pembuatan soal, "E-book" membuka wizard Generator E-Modul. Item E-book
 * ditandai aktif di seluruh alur e-modul (wizard, hasil generasi, pustaka).
 */
export const sidebarGroups: SidebarGroup[] = [
  {
    label: "Buat Materi",
    items: [
      { label: "Soal", to: "/generate", icon: FileText, description: "Susun naskah ujian dengan AI" },
      { label: "E-book", to: EMODUL_NEW_PATH, icon: BookOpen, activeMatch: EMODUL_PATH, description: "Susun e-modul & bahan ajar dengan AI" },
    ],
  },
  {
    label: "Pustaka",
    items: [
      { label: "Bank Soal", to: "/question-bank", icon: Library, description: "Soal tersimpan & siap dipakai ulang" },
      { label: "Riwayat Ujian", to: "/history", icon: History, description: "Paket ujian yang pernah dibuat" },
    ],
  },
  {
    label: "Akun",
    items: [
      { label: "Profil", to: PROFILE_PATH, icon: UserCircle, description: "Identitas & ringkasan akun" },
      { label: "Kredit & Transaksi", to: "/transactions", icon: Coins, description: "Mutasi kredit & langganan" },
    ],
  },
];

// Alamat "Pustaka E-Modul" dipakai saat fitur pustaka materi dibuka.
export const emodulLibraryPath = EMODUL_PATH;
