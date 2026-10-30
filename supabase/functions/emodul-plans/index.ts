// Detail paket langganan + manfaat E-Book.
//
// POST (tanpa body) → { plans: [...], current_tier }.
// Sumber harga/kredit/durasi adalah `billingPackages` di server; manfaat E-Book
// dibagikan ke semua paket premium.
//
// Sesi dijaga `requireUser`.

import { requireUser } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { buildEbookPlans } from "../_shared/ebook-plans.ts";
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
      .select("subscription_tier")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    return jsonResponse({
      plans: buildEbookPlans(),
      current_tier: profile.subscription_tier === "premium" ? "premium" : "free",
    });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memuat paket E-Book.",
    }, 500);
  }
});
