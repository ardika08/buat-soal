// Keluar: mengakhiri sesi pemanggil dengan mencabut refresh token-nya di Supabase
// Auth (scope global), sehingga token yang sama tidak bisa dipakai lagi.
//
// Sesi dijaga `requireUser`; token mentah diambil dari header Authorization untuk
// dicabut lewat admin client.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { bearerToken } from "../_shared/http.ts";
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

    const jwt = bearerToken(request);
    if (!jwt) {
      return jsonResponse({ message: "Token sesi tidak ditemukan." }, 401);
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.signOut(jwt, "global");

    if (error) {
      throw error;
    }

    return jsonResponse({ message: "Sesi berhasil diakhiri." });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal mengakhiri sesi.",
    }, 500);
  }
});
