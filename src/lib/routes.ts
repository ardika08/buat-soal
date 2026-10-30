/**
 * Alamat halaman kanonik aplikasi.
 *
 * Dipakai bersama oleh router, pengalihan setelah login, dan menu samping agar
 * setiap alamat hanya ditulis sekali. Beranda punya alamat sendiri supaya bisa
 * dibuka langsung, dibagikan, dan ditandai aktif di navigasi.
 */

export const HOME_PATH = "/beranda";
export const LOGIN_PATH = "/login";
export const PROFILE_PATH = "/profil";
export const PLANS_PATH = "/langganan";

// Modul E-book / E-Modul.
export const EMODUL_PATH = "/e-modul";
export const EMODUL_NEW_PATH = "/e-modul/baru";
export const EMODUL_ACCESS_PATH = "/e-modul/akses";
export const EMODUL_PREVIEW_PATH = `${EMODUL_PATH}/:id/pratinjau`;

/** Alamat pratinjau/unduh untuk satu draf e-modul. */
export function emodulPreviewPath(id: string) {
  return `${EMODUL_PATH}/${id}/pratinjau`;
}
