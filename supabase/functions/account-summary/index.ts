// Ringkasan kredit & paket langganan guru untuk beranda workspace.
//
// Menggabungkan baris `profiles` dengan penanda "pernah top-up" dari ledger
// `credit_transactions`, lalu menyusunnya lewat helper murni `buildAccountSummary`.
// Sesi dijaga `requireUser`; data diambil lewat admin client agar hasilnya konsisten.

import { buildAccountSummary } from "../_shared/account.ts";
import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
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
      .select("id, name, email, credits_balance, subscription_tier, subscription_expiry")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    const { count: topupCount, error: topupError } = await admin
      .from("credit_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("type", "topup");

    if (topupError) {
      throw topupError;
    }

    return jsonResponse(buildAccountSummary(profile, {
      hasPurchasedCredits: (topupCount ?? 0) > 0,
    }));
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memuat ringkasan akun.",
    }, 500);
  }
});
