export const billingPackages = {
  "topup-50": {
    id: "topup-50",
    type: "topup",
    name: "Top Up 50 Soal",
    description: "Cocok untuk satu paket ujian atau kebutuhan cepat akhir semester.",
    credits: 50,
    price: 25000,
    duration_months: null,
  },
  "topup-100": {
    id: "topup-100",
    type: "topup",
    name: "Top Up 100 Soal",
    description: "Lebih hemat untuk beberapa kelas atau beberapa mapel.",
    credits: 100,
    price: 40000,
    duration_months: null,
  },
  "premium-6m": {
    id: "premium-6m",
    type: "subscription",
    name: "Premium 6 Bulan",
    description: "Akses model premium dan kuota besar untuk satu semester.",
    credits: 1000,
    price: 149000,
    duration_months: 6,
  },
  "premium-12m": {
    id: "premium-12m",
    type: "subscription",
    name: "Premium 12 Bulan",
    description: "Paket tahunan untuk sekolah/guru aktif dengan kuota lebih besar.",
    credits: 2500,
    price: 249000,
    duration_months: 12,
  },
} as const;

export type BillingPackageId = keyof typeof billingPackages;

export type BillingPackage = (typeof billingPackages)[BillingPackageId];

export function findPackage(packageId: string): BillingPackage | null {
  if (!packageId || !Object.prototype.hasOwnProperty.call(billingPackages, packageId)) {
    return null;
  }
  return billingPackages[packageId as BillingPackageId];
}

/**
 * Status pembayaran yang diakui Mayar untuk invoice (`unpaid`, `paid`, `expired`, ...)
 * dipetakan ke status internal kita.
 *
 * Sengaja ketat: apa pun yang tidak dikenali jatuh ke 'pending', sehingga tidak mungkin
 * memberi kredit hanya karena string status yang aneh. Spasi/newline di sekeliling
 * dinormalisasi dulu supaya "paid\n" tetap dianggap lunas (bukan gagal dipenuhi).
 */
export function mapProviderStatus(providerStatus: string | null | undefined) {
  switch ((providerStatus ?? "").trim().toLowerCase()) {
    case "paid":
    case "success":
    case "settled":
      return "paid" as const;
    case "expired":
      return "expired" as const;
    case "failed":
      return "failed" as const;
    case "cancelled":
    case "canceled":
    case "closed":
      return "cancelled" as const;
    default:
      return "pending" as const;
  }
}

/** Batas waktu invoice (default 24 jam) supaya order pending tidak menggantung selamanya. */
export const INVOICE_TTL_MINUTES = 24 * 60;
