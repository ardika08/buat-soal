import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getDuitkuTransaction, mapDuitkuStatus, verifyDuitkuCallback } from "../_shared/duitku.ts";
import { createAdminClient } from "../_shared/supabase.ts";

/**
 * Webhook Duitku diverifikasi lewat HMAC-SHA256 dan pengecekan status server-side.
 * Pemberian benefit dilakukan oleh `fulfill_payment_order` yang mengunci baris order
 * (SELECT ... FOR UPDATE) dan idempoten, sehingga webhook berulang/replay aman.
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
    const raw = await request.text();
    const form = new URLSearchParams(raw);
    const payload = Object.fromEntries(form.entries());
    if (!(await verifyDuitkuCallback(payload))) {
      return jsonResponse({ message: "Signature callback Duitku tidak valid." }, 401);
    }

    const merchantOrderId = firstString(payload.merchantOrderId);
    const reference = firstString(payload.reference);
    if (payload.resultCode !== "00") {
      return jsonResponse({ message: "Callback bukan pembayaran sukses; status diverifikasi saat rekonsiliasi." }, 200);
    }
    const orderIdFromPayload = Number(merchantOrderId);

    const admin = createAdminClient();

    let order = null;
    if (merchantOrderId) {
      const { data: found } = await admin
        .from("payment_orders")
        .select("*")
        .eq("provider_order_id", merchantOrderId)
        .eq("provider", "duitku")
        .maybeSingle();
      order = found;
    }

    if (!order && Number.isFinite(orderIdFromPayload) && orderIdFromPayload > 0) {
      const { data: found } = await admin
        .from("payment_orders")
        .select("*")
        .eq("id", orderIdFromPayload)
        .eq("provider", "duitku")
        .maybeSingle();
      order = found;
    }

    if (!order) {
      // 200 supaya Duitku tidak mengulang tanpa henti untuk order yang tidak kita kenal.
      return jsonResponse({ message: "Order tidak ditemukan.", ignored: true }, 200);
    }

    // Sumber kebenaran: tanyakan status sebenarnya ke Duitku, jangan percaya payload mentah.
    const transaction = await getDuitkuTransaction(String(order.provider_order_id));
    if (Number(transaction.amount) !== Number(order.amount)) {
      return jsonResponse({ message: "Nominal transaksi Duitku tidak cocok dengan order." }, 409);
    }
    const providerStatus = mapDuitkuStatus(transaction.statusCode);

    const { data: result, error } = await admin.rpc("fulfill_payment_order", {
      p_order_id: order.id,
      p_provider_status: providerStatus,
      p_provider_transaction_id: firstString(transaction.reference, reference) ?? null,
    });

    if (error) {
      // 500 supaya Duitku mengulang: kegagalan sementara tidak boleh menghilangkan pembayaran sah.
      return jsonResponse({
        message: `Gagal memproses order: ${error.message}`,
        order_id: order.id,
      }, 500);
    }

    return jsonResponse({
      message: "Webhook Duitku diproses.",
      order_id: order.id,
      provider_status: providerStatus,
      applied: Boolean(result?.applied),
      reason: result?.reason ?? null,
    }, 200);
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Webhook gagal diproses.",
    }, 500);
  }
});

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}
