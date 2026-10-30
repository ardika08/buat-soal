/**
 * Nama berkas ekspor e-modul — murni tanpa I/O, bisa diuji dengan `node --test`.
 */

/** Ubah judul menjadi nama berkas aman: "Modul: IPA/Bab 1" → "modul-ipa-bab-1.pdf". */
export function emodulExportFilename(title: string, extension: "pdf" | "docx"): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    // Pemisah (titik dua, garis miring, tanda baca) dijadikan spasi agar kata
    // tidak menempel.
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  return `${slug || "e-modul"}.${extension}`;
}
