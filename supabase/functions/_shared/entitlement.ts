/**
 * Hak akses unduh E-Book berdasarkan langganan — murni tanpa I/O.
 *
 * Aturan sama dengan pemeriksaan di klien & `expire_subscriptions`: premium tanpa
 * tanggal kedaluwarsa berlaku selamanya; premium dengan tanggal yang sudah lewat
 * dianggap tidak berhak (sampai sweep database menurunkannya ke free).
 */

import { EBOOK_BENEFITS, type EbookBenefit } from "./ebook-plans.ts";

export type EbookTier = "free" | "premium";
export type EbookEntitlementReason = "active_subscription" | "upgrade_required";

export interface EbookEntitlement {
  entitled: boolean;
  tier: EbookTier;
  expires_at: string | null;
  reason: EbookEntitlementReason;
}

export interface EbookAccessResponse extends EbookEntitlement {
  upgrade_required: boolean;
  /** Manfaat yang terbuka bila berhak; kosong bila belum. */
  benefits: EbookBenefit[];
}

function normalizeTier(value: unknown): EbookTier {
  return value === "premium" ? "premium" : "free";
}

function normalizeExpiry(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function resolveEbookEntitlement(
  profile: { subscription_tier?: unknown; subscription_expiry?: unknown },
  now = Date.now(),
): EbookEntitlement {
  const tier = normalizeTier(profile.subscription_tier);
  const expiresAt = normalizeExpiry(profile.subscription_expiry);

  const active = tier === "premium"
    && (expiresAt === null || new Date(expiresAt).getTime() > now);

  return {
    entitled: active,
    tier,
    expires_at: expiresAt,
    reason: active ? "active_subscription" : "upgrade_required",
  };
}

/**
 * Bentuk respons pemeriksaan akses untuk klien.
 *
 * Saat berhak, manfaat E-Book disertakan agar UI bisa menampilkannya langsung;
 * saat belum berhak, daftar manfaat kosong dan `upgrade_required` menyala.
 */
export function buildEbookAccessResponse(entitlement: EbookEntitlement): EbookAccessResponse {
  return {
    ...entitlement,
    upgrade_required: !entitlement.entitled,
    benefits: entitlement.entitled ? EBOOK_BENEFITS : [],
  };
}
