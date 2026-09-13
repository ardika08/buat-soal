export const billingPackages = {
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

// --- Custom top-up: user buys any amount of credits at a flat rate ---

export const CUSTOM_CREDIT_RATE = 200; // Rp 200 per kredit
export const CUSTOM_TOPUP_MIN = 10;
export const CUSTOM_TOPUP_MAX = 5000;
export const CUSTOM_TOPUP_PACKAGE_ID = "custom-topup";

export interface ResolvedCheckout {
  packageId: string;
  orderType: "topup" | "subscription";
  credits: number;
  amount: number;
  name: string;
  durationMonths: number | null;
}

export function resolveCheckoutInput(body: Record<string, unknown>): ResolvedCheckout | null {
  // Subscription package (fixed price + credits)
  const packageId = typeof body.package_id === "string" ? body.package_id : "";
  if (packageId) {
    const pkg = findPackage(packageId);
    if (pkg) {
      return {
        packageId: pkg.id,
        orderType: pkg.type,
        credits: pkg.credits,
        amount: pkg.price,
        name: pkg.name,
        durationMonths: pkg.duration_months,
      };
    }
  }

  // Custom top-up (credits × flat rate)
  const credits = Number(body.credits);
  if (Number.isFinite(credits) && credits >= CUSTOM_TOPUP_MIN && credits <= CUSTOM_TOPUP_MAX) {
    const rounded = Math.floor(credits);
    return {
      packageId: CUSTOM_TOPUP_PACKAGE_ID,
      orderType: "topup",
      credits: rounded,
      amount: rounded * CUSTOM_CREDIT_RATE,
      name: `Top Up ${rounded} Kredit`,
      durationMonths: null,
    };
  }

  return null;
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

/**
 * Apakah order ini masih perlu ditanyakan ulang ke Mayar?
 *
 * Bukan hanya `pending`: order yang sudah disapu menjadi `expired` oleh batas waktu TTL
 * tetap harus diperiksa, karena pengguna bisa saja membayar tepat sebelum batas waktu.
 * Kalau order seperti itu dilewati, uang pengguna masuk tetapi kreditnya tidak pernah
 * turun. Order `paid`/`failed`/`cancelled` tidak perlu diperiksa lagi.
 */
export function shouldReconcileOrder(orderStatus: string, providerOrderId: string | null | undefined) {
  if (!providerOrderId) {
    return false;
  }

  const status = (orderStatus ?? "").trim().toLowerCase();
  return status === "pending" || status === "expired";
}

/**
 * URL kembali setelah pembayaran di Mayar.
 *
 * `order_id` WAJIB dibawa: tanpa itu halaman kembali tidak tahu order mana yang harus
 * diperiksa, sehingga pengguna yang sudah membayar tidak pernah melihat kreditnya masuk.
 */
export function buildBillingReturnUrl(baseUrl: string | null | undefined, orderId: number) {
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "") || "https://soalify.app";
  return `${base}/billing/return?order_id=${encodeURIComponent(String(orderId))}`;
}
