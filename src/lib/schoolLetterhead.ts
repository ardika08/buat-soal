/**
 * Identitas sekolah untuk kop dokumen e-modul.
 *
 * Disimpan di localStorage selama endpoint penyimpanan kop belum ada; bentuk ini
 * juga menjadi kontrak payload saat endpoint kop dibuat nanti.
 */

export interface SchoolLetterhead {
  school_name: string;
  address: string;
  phone: string;
  email: string;
  headmaster: string;
  nip: string;
}

export const EMPTY_SCHOOL_LETTERHEAD: SchoolLetterhead = {
  school_name: "",
  address: "",
  phone: "",
  email: "",
  headmaster: "",
  nip: "",
};

/** Kop dianggap terisi bila nama sekolah diisi. */
export function hasSchoolLetterhead(value: SchoolLetterhead): boolean {
  return value.school_name.trim().length > 0;
}

const STORAGE_KEY = "soalify:emodul-letterhead";

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function loadSchoolLetterhead(): SchoolLetterhead {
  if (typeof window === "undefined") {
    return EMPTY_SCHOOL_LETTERHEAD;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return EMPTY_SCHOOL_LETTERHEAD;
    }

    const parsed = JSON.parse(raw) as Partial<SchoolLetterhead>;

    return {
      school_name: toText(parsed.school_name),
      address: toText(parsed.address),
      phone: toText(parsed.phone),
      email: toText(parsed.email),
      headmaster: toText(parsed.headmaster),
      nip: toText(parsed.nip),
    };
  } catch {
    return EMPTY_SCHOOL_LETTERHEAD;
  }
}

export function saveSchoolLetterhead(value: SchoolLetterhead): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Penyimpanan lokal tidak tersedia (mode privat/kuota) — abaikan.
  }
}
