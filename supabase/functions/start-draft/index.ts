// Inisiasi draf baru dari beranda: menentukan alamat halaman mulai untuk
// "soal baru" atau "e-modul baru". Frontend cukup memanggil endpoint ini lalu
// mengarahkan pengguna, sehingga alamat modul tidak di-hardcode di klien.
//
// Sesi dijaga `requireUser`.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { isDraftType, resolveStartTarget } from "../_shared/start.ts";

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

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const type = body.type ?? "exam";

    if (!isDraftType(type)) {
      return jsonResponse({
        message: "Jenis draf tidak dikenal. Gunakan 'exam' atau 'e_modul'.",
      }, 422);
    }

    return jsonResponse(resolveStartTarget(type));
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memulai draf baru.",
    }, 500);
  }
});
