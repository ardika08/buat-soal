import { billingPackages, type BillingPackageId } from "../_shared/billing.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) {
    return options;
  }

  try {
    const userClient = createUserClient(request);
    const admin = createAdminClient();
    const { data: auth, error: authError } = await userClient.auth.getUser();

    if (authError || !auth.user) {
      return jsonResponse({ message: "Unauthenticated." }, 401);
    }

    const body = await request.json();
    const packageId = body.package_id as BillingPackageId;
    const selectedPackage = billingPackages[packageId];
    if (!selectedPackage) {
      return jsonResponse({ message: "Paket tidak ditemukan." }, 404);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    let subscriptionExpiry = profile.subscription_expiry;
    let subscriptionTier = profile.subscription_tier;

    if (selectedPackage.type === "subscription") {
      const startsAt = subscriptionExpiry && new Date(subscriptionExpiry).getTime() > Date.now()
        ? new Date(subscriptionExpiry)
        : new Date();
      startsAt.setMonth(startsAt.getMonth() + Number(selectedPackage.duration_months));
      subscriptionExpiry = startsAt.toISOString();
      subscriptionTier = "premium";
    }

    const { data: updatedProfile, error: updateError } = await admin
      .from("profiles")
      .update({
        credits_balance: Number(profile.credits_balance) + selectedPackage.credits,
        subscription_tier: subscriptionTier,
        subscription_expiry: subscriptionExpiry,
      })
      .eq("id", profile.id)
      .select("*")
      .single();

    if (updateError || !updatedProfile) {
      throw updateError ?? new Error("Gagal memperbarui profil.");
    }

    await admin.from("credit_transactions").insert({
      user_id: profile.id,
      type: selectedPackage.type === "subscription" ? "subscription" : "topup",
      amount: selectedPackage.credits,
      description: `${selectedPackage.name} - Rp ${new Intl.NumberFormat("id-ID").format(selectedPackage.price)}`,
    });

    return jsonResponse({
      message: "Checkout berhasil.",
      package: selectedPackage,
      user: formatUser(updatedProfile),
    });
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Checkout gagal.",
    }, 500);
  }
});

function formatUser(profile: Record<string, unknown>) {
  return {
    id: Number(profile.id),
    name: String(profile.name),
    email: String(profile.email),
    subscription_tier: profile.subscription_tier,
    credits_balance: Number(profile.credits_balance),
    subscription_expiry: profile.subscription_expiry,
  };
}
