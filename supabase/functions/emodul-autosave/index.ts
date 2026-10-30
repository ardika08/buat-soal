// Simpan otomatis satu bagian e-modul (dipanggil editor saat guru berhenti mengetik).
//
// POST { section_id, title?, content? } → perbarui judul/isi bagian milik pengguna.
// Hanya field yang dikirim yang diubah; minimal satu harus ada.
//
// Sesi dijaga `requireUser`.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface AutosaveRequest {
  section_id?: number | string;
  title?: unknown;
  content?: unknown;
}

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

    const admin = createAdminClient();
    const body = await request.json().catch(() => ({})) as AutosaveRequest;
    const sectionId = Number(body.section_id);

    if (!Number.isInteger(sectionId) || sectionId <= 0) {
      return jsonResponse({ message: "section_id tidak valid." }, 422);
    }

    const title = typeof body.title === "string" ? body.title : null;
    const content = typeof body.content === "string" ? body.content : null;

    if (title === null && content === null) {
      return jsonResponse({ message: "Tidak ada perubahan untuk disimpan." }, 422);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    const { data: saved, error: saveError } = await admin.rpc("autosave_emodul_section", {
      p_user_id: profile.id,
      p_section_id: sectionId,
      p_title: title,
      p_content: content,
    });

    if (saveError) {
      const message = String(saveError.message ?? "");

      if (message.includes("not_found")) {
        return jsonResponse({ message: "Bagian tidak ditemukan atau bukan milik Anda." }, 404);
      }

      throw saveError;
    }

    return jsonResponse({ message: "Bagian tersimpan.", section: saved });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal menyimpan bagian.",
    }, 500);
  }
});
