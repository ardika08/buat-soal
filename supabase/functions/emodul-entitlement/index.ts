// Cek hak akses unduh E-Book.
//
// POST (tanpa body) → { entitled, tier, expires_at, reason }.
// Dipakai editor/pratinjau sebelum menyusun atau mengunduh modul, mengikuti pola
// pemeriksaan langganan yang sudah ada.
//
// Sesi dijaga `requireUser`.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { buildEbookAccessResponse, resolveEbookEntitlement } from "../_shared/entitlement.ts";
import { createAdminClient } from "../_shared/supabase.ts";

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
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("subscription_tier, subscription_expiry")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    return jsonResponse(buildEbookAccessResponse(resolveEbookEntitlement(profile)));
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memeriksa hak akses E-Book.",
    }, 500);
  }
});
