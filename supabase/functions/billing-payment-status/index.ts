import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getMayarInvoice } from "../_shared/mayar.ts";
import { mapProviderStatus, shouldReconcileOrder } from "../_shared/billing.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

/**
 * Status pembayaran satu order (dipanggil frontend setelah kembali dari Mayar).
 *
 * Bertindak sebagai jaring pengaman webhook: bila webhook belum/tidak sampai tetapi
 * Mayar menyatakan invoice sudah lunas, order tetap dipenuhi di sini — lewat RPC
 * idempoten yang sama, sehingga tidak mungkin memberi kredit dua kali.
 */
Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) {
    return options;
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "Method tidak diizinkan." }, 405);
  }

  try {
    const userClient = createUserClient(request);
    const admin = createAdminClient();
    const { data: auth, error: authError } = await userClient.auth.getUser();

    if (authError || !auth.user) {
      return jsonResponse({ message: "Unauthenticated." }, 401);
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const orderId = Number(body.order_id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return jsonResponse({ message: "Order tidak valid." }, 422);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, credits_balance, subscription_tier, subscription_expiry")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    const { data: order, error: orderError } = await admin
      .from("payment_orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (orderError || !order) {
      return jsonResponse({ message: "Order pembayaran tidak ditemukan." }, 404);
    }

    let user = toPublicUser(profile);

    // Bukan hanya `pending`: order yang sudah disapu TTL jadi `expired` tetap diperiksa,
    // karena pembayaran yang masuk tepat sebelum batas waktu tidak boleh hilang.
    if (shouldReconcileOrder(order.status, order.provider_order_id)) {
      const invoice = await getMayarInvoice(String(order.provider_order_id));
      const providerStatus = mapProviderStatus(invoice.status);

      const { data: result, error: fulfillError } = await admin.rpc("fulfill_payment_order", {
        p_order_id: order.id,
        p_provider_status: providerStatus,
        p_provider_transaction_id: invoice.transactionId ?? null,
      });

      if (fulfillError) {
        return jsonResponse({
          message: `Gagal menyinkronkan status pembayaran: ${fulfillError.message}`,
        }, 500);
      }

      if (result?.profile) {
        user = toPublicUser(result.profile);
      }

      order.status = providerStatus;
    }

    const { data: freshProfile } = await admin
      .from("profiles")
      .select("id, credits_balance, subscription_tier, subscription_expiry")
      .eq("id", profile.id)
      .single();

    if (freshProfile) {
      user = toPublicUser(freshProfile);
    }

    return jsonResponse({
      message: describeStatus(order.status),
      order: toPublicOrder(order),
      payment: toPublicPayment(order),
      user,
    }, 200);
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Gagal memeriksa status pembayaran.",
    }, 500);
  }
});

function describeStatus(status: string) {
  switch (status) {
    case "paid":
      return "Pembayaran berhasil. Kredit sudah ditambahkan.";
    case "expired":
      return "Invoice sudah kedaluwarsa. Silakan buat order baru.";
    case "failed":
      return "Pembayaran gagal.";
    case "cancelled":
      return "Order dibatalkan.";
    default:
      return "Pembayaran belum diterima. Selesaikan pembayaran Anda terlebih dahulu.";
  }
}

function toPublicUser(profile: Record<string, unknown>) {
  return {
    id: Number(profile.id),
    name: profile.name ?? "",
    email: profile.email ?? "",
    credits_balance: Number(profile.credits_balance),
    subscription_tier: profile.subscription_tier,
    subscription_expiry: profile.subscription_expiry ?? null,
  };
}

function toPublicOrder(order: Record<string, unknown>) {
  return {
    id: Number(order.id),
    package_id: String(order.package_id),
    order_type: order.order_type,
    status: order.status,
    amount: Number(order.amount),
    credits: Number(order.credits),
    created_at: order.created_at,
    paid_at: order.paid_at ?? null,
  };
}

function toPublicPayment(order: Record<string, unknown>) {
  return {
    order_id: Number(order.id),
    provider: String(order.provider),
    provider_order_id: order.provider_order_id ?? null,
    provider_transaction_id: order.provider_transaction_id ?? null,
    status: String(order.status),
    amount: Number(order.amount),
    credits: Number(order.credits),
    checkout_url: order.checkout_url ?? null,
  };
}
