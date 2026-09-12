import { mapProviderStatus } from "../_shared/billing.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getMayarInvoice } from "../_shared/mayar.ts";
import { createAdminClient } from "../_shared/supabase.ts";

/**
 * Webhook Mayar (event `payment.received`).
 *
 * Model keamanan:
 *  - Payload webhook TIDAK dipercaya. Yang dipercaya hanya hasil `GET /invoice/{id}` ke API Mayar.
 *  - Endpoint memverifikasi shared secret opsional (`MAYAR_WEBHOOK_SECRET`) lebih dulu.
 *  - Pemberian benefit dilakukan oleh `fulfill_payment_order` yang mengunci baris order
 *    (SELECT ... FOR UPDATE) dan idempoten, sehingga webhook berulang/replay aman.
 */
Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) {
    return options;
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "Method tidak diizinkan." }, 405);
  }

  const secretError = verifyWebhookSecret(request);
  if (secretError) {
    return secretError;
  }

  try {
    const raw = await request.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      return jsonResponse({ message: "Payload webhook bukan JSON yang valid." }, 400);
    }

    const data = (payload.data ?? {}) as Record<string, unknown>;
    const providerOrderId = firstString(data.id, payload.id);
    const extraData = (data.extraData ?? payload.extraData ?? {}) as Record<string, unknown>;
    const orderIdFromPayload = Number(firstString(extraData.orderId, data.orderId) ?? 0);

    const admin = createAdminClient();

    let order = null;
    if (providerOrderId) {
      const { data: found } = await admin
        .from("payment_orders")
        .select("*")
        .eq("provider_order_id", providerOrderId)
        .maybeSingle();
      order = found;
    }

    if (!order && Number.isFinite(orderIdFromPayload) && orderIdFromPayload > 0) {
      const { data: found } = await admin
        .from("payment_orders")
        .select("*")
        .eq("id", orderIdFromPayload)
        .maybeSingle();
      order = found;
    }

    if (!order) {
      // 200 supaya Mayar tidak mengulang tanpa henti untuk order yang tidak kita kenal.
      return jsonResponse({ message: "Order tidak ditemukan.", ignored: true }, 200);
    }

    if (!order.provider_order_id) {
      return jsonResponse({ message: "Order belum memiliki invoice Mayar.", ignored: true }, 200);
    }

    // Sumber kebenaran: tanyakan status sebenarnya ke Mayar.
    const invoice = await getMayarInvoice(String(order.provider_order_id));
    const providerStatus = mapProviderStatus(invoice.status);

    const { data: result, error } = await admin.rpc("fulfill_payment_order", {
      p_order_id: order.id,
      p_provider_status: providerStatus,
      p_provider_transaction_id: invoice.transactionId ?? null,
    });

    if (error) {
      // 500 supaya Mayar mengulang: kegagalan sementara tidak boleh menghilangkan pembayaran sah.
      return jsonResponse({
        message: `Gagal memproses order: ${error.message}`,
        order_id: order.id,
      }, 500);
    }

    return jsonResponse({
      message: "Webhook diproses.",
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

/**
 * Mayar tidak menandatangani payload webhook, jadi verifikasi memakai shared secret
 * yang kita pasang sendiri di URL webhook (`?token=...` atau header).
 * Bila `MAYAR_WEBHOOK_SECRET` belum diisi, endpoint berjalan tanpa cek ini — tetapi
 * tetap aman terhadap replay karena verifikasi status dilakukan ke API Mayar.
 */
function verifyWebhookSecret(request: Request) {
  const expected = Deno.env.get("MAYAR_WEBHOOK_SECRET");
  if (!expected) {
    return null;
  }

  const url = new URL(request.url);
  const provided = url.searchParams.get("token")
    ?? request.headers.get("x-webhook-token")
    ?? bearerFromHeader(request.headers.get("Authorization"));

  if (!provided || !timingSafeEqual(provided, expected)) {
    return jsonResponse({ message: "Token webhook tidak valid." }, 401);
  }

  return null;
}

function bearerFromHeader(header: string | null) {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Perbandingan waktu-tetap supaya token tidak bisa ditebak lewat timing. */
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < a.length; index++) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return diff === 0;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}
