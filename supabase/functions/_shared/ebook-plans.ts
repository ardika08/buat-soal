/**
 * Detail paket langganan + manfaat E-Book — murni tanpa I/O.
 *
 * Sumber harga/kredit/durasi adalah `billingPackages` di `_shared/billing.ts`
 * (otoritas server). Manfaat E-Book dibagikan ke semua paket premium karena
 * E-Book dibundel ke langganan yang sama, bukan sistem pembayaran terpisah.
 */

import { billingPackages } from "./billing.ts";

export type EbookTier = "free" | "premium";

export interface EbookBenefit {
  key: string;
  label: string;
}

export interface EbookPlanDetail {
  id: string;
  name: string;
  description: string;
  tier: EbookTier;
  credits: number;
  price: number;
  duration_months: number | null;
  ebook_included: boolean;
  benefits: EbookBenefit[];
}

/** Manfaat E-Book untuk semua paket berlangganan. */
export const EBOOK_BENEFITS: EbookBenefit[] = [
  { key: "akses_emodul", label: "Akses seluruh e-modul & bahan ajar" },
  { key: "unduh_pdf", label: "Unduh PDF tanpa batas" },
  { key: "unduh_docx", label: "Unduh DOCX tanpa batas" },
  { key: "kop_sekolah", label: "Kop identitas sekolah pada dokumen" },
  { key: "pembaruan_materi", label: "Pembaruan struktur & konten modul" },
];

export const FREE_EBOOK_PLAN: EbookPlanDetail = {
  id: "free",
  name: "Paket Dasar",
  description: "Mulai tanpa biaya dengan fitur Soal.",
  tier: "free",
  credits: 0,
  price: 0,
  duration_months: null,
  ebook_included: false,
  benefits: [],
};

/** Daftar paket: Paket Dasar lebih dulu, lalu paket premium berurutan. */
export function buildEbookPlans(): EbookPlanDetail[] {
  const premiumPlans = Object.values(billingPackages).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    tier: "premium" as const,
    credits: item.credits,
    price: item.price,
    duration_months: item.duration_months,
    ebook_included: true,
    benefits: EBOOK_BENEFITS,
  }));

  return [FREE_EBOOK_PLAN, ...premiumPlans];
}
