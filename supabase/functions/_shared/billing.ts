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
