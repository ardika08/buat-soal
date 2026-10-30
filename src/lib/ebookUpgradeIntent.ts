/**
 * Niat upgrade E-Book yang tertunda.
 *
 * Saat pengguna gratis menekan unduhan yang terkunci, niatnya disimpan lokal
 * (halaman asal + aksi). Setelah upgrade berhasil, aplikasi kembali ke halaman
 * asal dan menawarkan melanjutkan aksi tersebut. Bentuk ini juga menjadi
 * kontrak payload saat endpoint "simpan niat upgrade" tersedia.
 */

export type EbookResumeAction = "download_pdf" | "download_docx";

export interface EbookUpgradeIntent {
  /** Alamat halaman asal (pathname + query) untuk dikunjungi kembali. */
  return_to: string;
  action: EbookResumeAction;
  created_at: string;
}

const STORAGE_KEY = "soalify:ebook-upgrade-intent";

function pathnameOf(value: string): string {
  return value.split("?")[0].split("#")[0];
}

/** Apakah niat ini bisa dilanjutkan di halaman saat ini. */
export function isResumableIntent(
  intent: EbookUpgradeIntent | null | undefined,
  currentPath: string,
): boolean {
  if (!intent || !intent.return_to) {
    return false;
  }

  return pathnameOf(intent.return_to) === pathnameOf(currentPath);
}

export function saveEbookUpgradeIntent(intent: EbookUpgradeIntent): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // Penyimpanan lokal tidak tersedia — abaikan.
  }
}

export function loadEbookUpgradeIntent(): EbookUpgradeIntent | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<EbookUpgradeIntent>;
    const action = parsed.action;

    if (
      typeof parsed.return_to !== "string"
      || (action !== "download_pdf" && action !== "download_docx")
    ) {
      return null;
    }

    return {
      return_to: parsed.return_to,
      action,
      created_at: typeof parsed.created_at === "string" ? parsed.created_at : "",
    };
  } catch {
    return null;
  }
}

export function clearEbookUpgradeIntent(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // abaikan
  }
}
