// Simpan & ambil konfigurasi kop identitas sekolah + tata letak e-modul.
//
// POST { action: "get" }                 → pengaturan milik pengguna.
// POST { action: "save", settings: {...} } → simpan (upsert) lalu kembalikan.
//
// Sesi dijaga `requireUser`; mutasi lewat RPC `save_emodul_settings`.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { normalizeEModulSettings } from "../_shared/emodul-settings.ts";
import { createAdminClient } from "../_shared/supabase.ts";

interface SettingsRequest {
  action?: "get" | "save";
  settings?: unknown;
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
    const body = await request.json().catch(() => ({})) as SettingsRequest;
    const action = body.action ?? "get";

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    if (action === "save") {
      const settings = normalizeEModulSettings(body.settings);

      const { data: saved, error: saveError } = await admin.rpc("save_emodul_settings", {
        p_user_id: profile.id,
        p_settings: settings,
      });

      if (saveError) {
        throw saveError;
      }

      return jsonResponse({
        message: "Konfigurasi kop tersimpan.",
        settings: normalizeEModulSettings(saved),
      });
    }

    if (action !== "get") {
      return jsonResponse({ message: "Aksi tidak dikenal. Gunakan 'get' atau 'save'." }, 422);
    }

    const { data: settings, error: settingsError } = await admin.rpc("get_emodul_settings", {
      p_user_id: profile.id,
    });

    if (settingsError) {
      throw settingsError;
    }

    return jsonResponse({ settings: normalizeEModulSettings(settings) });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memproses konfigurasi kop.",
    }, 500);
  }
});
