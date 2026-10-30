/**
 * Normalisasi konfigurasi kop & tata letak e-modul — murni tanpa I/O.
 *
 * Dipakai Edge Function sebelum menyimpan/mengembalikan pengaturan agar bentuk
 * yang diterima klien selalu pasti (string, bukan `undefined`; layout objek).
 */

export type EModulSettingsLayout = Record<string, unknown>;

export interface EModulSettings {
  school_name: string;
  address: string;
  phone: string;
  email: string;
  headmaster: string;
  nip: string;
  layout: EModulSettingsLayout;
}

export const EMPTY_EMODUL_SETTINGS: EModulSettings = {
  school_name: "",
  address: "",
  phone: "",
  email: "",
  headmaster: "",
  nip: "",
  layout: {},
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeEModulSettings(raw: unknown): EModulSettings {
  const source = (raw ?? {}) as Record<string, unknown>;
  const layout = source.layout;

  return {
    school_name: text(source.school_name),
    address: text(source.address),
    phone: text(source.phone),
    email: text(source.email),
    headmaster: text(source.headmaster),
    nip: text(source.nip),
    layout:
      layout && typeof layout === "object" && !Array.isArray(layout)
        ? layout as EModulSettingsLayout
        : {},
  };
}
