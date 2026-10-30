/**
 * Validasi niat upgrade E-Book — murni tanpa I/O.
 *
 * `return_to` wajib berupa path internal (mulai "/" tunggal) agar tidak bisa
 * dipakai sebagai open redirect. Aksi dibatasi ke unduhan yang dikenal.
 */

export type EbookIntentAction = "download_pdf" | "download_docx";

export interface NormalizedUpgradeIntent {
  return_to: string;
  action: EbookIntentAction;
}

const MAX_RETURN_LENGTH = 500;

export function isSafeReturnPath(value: string): boolean {
  return value.startsWith("/")
    && !value.startsWith("//")
    && value.length <= MAX_RETURN_LENGTH;
}

export function normalizeUpgradeIntent(input: {
  return_to?: unknown;
  action?: unknown;
}): NormalizedUpgradeIntent | null {
  const returnTo = typeof input.return_to === "string" ? input.return_to.trim() : "";
  const action = input.action;

  if (!isSafeReturnPath(returnTo)) {
    return null;
  }

  if (action !== "download_pdf" && action !== "download_docx") {
    return null;
  }

  return { return_to: returnTo, action };
}
