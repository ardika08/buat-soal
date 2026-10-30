/**
 * Bentuk ringkasan akun (kredit & paket langganan) yang dikirim ke klien.
 *
 * Murni tanpa I/O supaya bisa diuji dengan `node --test`. Pemanggil (Edge
 * Function) yang mengambil baris profil dan menghitung riwayat top-up dari
 * ledger, lalu menyerahkannya ke `buildAccountSummary`.
 */

export type AccountTier = "free" | "premium";

export interface AccountSummary {
  id: number;
  name: string;
  email: string;
  credits_balance: number;
  subscription_tier: AccountTier;
  subscription_expiry: string | null;
  has_purchased_credits: boolean;
  subscription_active: boolean;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Hanya tier yang dikenal yang lolos. Nilai asing (enum baru, salah ketik,
 * data lama) diperlakukan sebagai `free` — gagal ke arah yang aman.
 */
function toTier(value: unknown): AccountTier {
  return value === "premium" ? "premium" : "free";
}

function toExpiry(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

/** Premium aktif bila tier premium dan masa berlakunya belum lewat. */
export function isSubscriptionActive(tier: AccountTier, expiry: string | null, now = Date.now()): boolean {
  if (tier !== "premium") {
    return false;
  }
  if (!expiry) {
    return true;
  }
  const time = new Date(expiry).getTime();
  return Number.isNaN(time) ? false : time > now;
}

export function buildAccountSummary(
  profile: Record<string, unknown>,
  options: { hasPurchasedCredits?: boolean; now?: number } = {},
): AccountSummary {
  const tier = toTier(profile.subscription_tier);
  const expiry = toExpiry(profile.subscription_expiry);

  return {
    id: toNumber(profile.id),
    name: toText(profile.name),
    email: toText(profile.email),
    credits_balance: toNumber(profile.credits_balance),
    subscription_tier: tier,
    subscription_expiry: expiry,
    has_purchased_credits: options.hasPurchasedCredits === true,
    subscription_active: isSubscriptionActive(tier, expiry, options.now),
  };
}
