// Penjaga sesi rute modul: memastikan pemanggil punya sesi aktif sebelum masuk
// ke modul terproteksi. Mengembalikan identitas sesi (id + email) atau 401.
//
// Frontend memakai endpoint ini untuk memverifikasi sesi dari sisi server sebelum
// merender modul; pemeriksaan utama tetap RLS + penjaga rute di klien.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) {
    return options;
  }

  try {
    const auth = await requireUser(request);
    if ("response" in auth) {
      return auth.response;
    }

    return jsonResponse({ authenticated: true, user: auth.user });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memeriksa sesi.",
    }, 500);
  }
});
