import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const MAX_ENTRIES = 5;
const MAX_AGE_DAYS = 30;

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from("payment_orders")
      .select("customer_name, order_type, package_snapshot, credits, paid_at, fulfilled_at")
      .eq("status", "paid")
      .gte("paid_at", since)
      .order("paid_at", { ascending: false })
      .limit(MAX_ENTRIES);

    if (error) throw error;

    return jsonResponse({
      entries: (data ?? []).map((order) => ({
        // Hanya nama depan + inisial. Email, telepon, nominal, ID, dan payload
        // provider tidak pernah keluar dari server.
        display_name: anonymizeName(order.customer_name),
        purchase_label: purchaseLabel(order),
        paid_at: order.paid_at ?? order.fulfilled_at,
      })),
    });
  } catch (error) {
    console.error("[sales-proof]", error);
    // Social proof bersifat non-kritis. Respons kosong mencegah data rekaan atau
    // detail internal bocor saat query gagal.
    return jsonResponse({ entries: [] });
  }
});

function anonymizeName(value: unknown) {
  const words = String(value ?? "Guru").trim().split(/\s+/).filter(Boolean);
  const first = words[0] || "Guru";
  const initial = words[1]?.charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : `${first.charAt(0).toUpperCase()}***`;
}

function purchaseLabel(order: Record<string, unknown>) {
  const snapshot = order.package_snapshot as Record<string, unknown> | null;
  const snapshotName = typeof snapshot?.name === "string" ? snapshot.name.trim() : "";
  if (snapshotName) return snapshotName;
  if (order.order_type === "subscription") return "Paket Premium";
  const credits = Number(order.credits ?? 0);
  return credits > 0 ? `Top Up ${credits} Kredit` : "Top Up Kredit";
}
