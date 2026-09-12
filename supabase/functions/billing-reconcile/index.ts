import { INVOICE_TTL_MINUTES, mapProviderStatus } from "../_shared/billing.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getMayarInvoice } from "../_shared/mayar.ts";
import { createAdminClient } from "../_shared/supabase.ts";

/**
 * Rekonsiliasi pembayaran: jaring pengaman terakhir bila webhook Mayar tidak pernah sampai.
 *
 * Dipanggil oleh penjadwal (cron) dengan header `x-reconcile-token`, atau oleh admin.
 * Webhook tetap jalur utama; fungsi ini hanya memastikan pembayaran yang sudah dibayar
 * di sisi Mayar pada akhirnya tetap dipenuhi.
 *
 * Keamanan:
 *  - Tidak memercayai data di database sendiri soal status bayar: selalu tanya ke Mayar.
 *  - Memakai RPC `fulfill_payment_order` yang idempoten, jadi rekonsiliasi berulang
 *    tidak mungkin menggandakan kredit.
 *  - Hanya order yang masih pending/expired dan punya invoice yang diperiksa.
 */
Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) {
    return options;
  }

  if (request.method !== "POST") {
    return jsonResponse({ message: "Method tidak diizinkan." }, 405);
  }

  const authError = verifySchedulerToken(request);
  if (authError) {
    return authError;
  }

  try {
    const admin = createAdminClient();
    const url = new URL(request.url);
    const limit = clampNumber(url.searchParams.get("limit"), 50, 1, 200);
    const days = clampNumber(url.searchParams.get("days"), 7, 1, 90);
    const shouldSweep = url.searchParams.get("sweep") !== "false";

    // Perawatan berkala lebih dulu: langganan yang lewat masa berlaku diturunkan dan
    // order pending yang menggantung ditutup. Tanpa langkah ini, premium tidak pernah
    // turun dan order lama menumpuk — pembersihan hanya berjalan bila dijadwalkan.
    const sweeps: Record<string, unknown> = {};
    if (shouldSweep) {
      const { data: subscriptionSweep } = await admin.rpc("expire_subscriptions");
      const { data: orderSweep } = await admin.rpc("expire_stale_payment_orders", {
        p_ttl_minutes: INVOICE_TTL_MINUTES,
      });
      sweeps.subscriptions = subscriptionSweep;
      sweeps.orders = orderSweep;
    }

    const { data: candidateResult, error: candidateError } = await admin.rpc("orders_for_reconciliation", {
      p_limit: limit,
      p_days: days,
    });

    if (candidateError) {
      throw new Error(candidateError.message);
    }

    const candidates = Array.isArray(candidateResult?.orders) ? candidateResult.orders : [];

    const summary = {
      checked: candidates.length,
      fulfilled: 0,
      expired: 0,
      still_pending: 0,
      skipped: 0,
      errors: [] as Array<{ order_id: number; message: string }>,
    };

    for (const candidate of candidates) {
      const orderId = Number(candidate.id);

      try {
        // Sumber kebenaran: status sebenarnya di Mayar, bukan kolom di database kita.
        const invoice = await getMayarInvoice(String(candidate.provider_order_id));
        const providerStatus = mapProviderStatus(invoice.status);

        const { data: result, error } = await admin.rpc("fulfill_payment_order", {
          p_order_id: orderId,
          p_provider_status: providerStatus,
          p_provider_transaction_id: invoice.transactionId ?? null,
        });

        if (error) {
          throw new Error(error.message);
        }

        if (result?.applied) {
          summary.fulfilled++;
        } else if (providerStatus === "paid") {
          // Sudah pernah dipenuhi webhook: bukan masalah, memang idempoten.
          summary.skipped++;
        } else if (providerStatus === "expired" || providerStatus === "failed" || providerStatus === "cancelled") {
          summary.expired++;
        } else {
          summary.still_pending++;
        }
      } catch (error) {
        // Satu invoice bermasalah tidak boleh menghentikan sisanya.
        summary.errors.push({
          order_id: orderId,
          message: error instanceof Error ? error.message : "Gagal merekonsiliasi order.",
        });
      }
    }

    return jsonResponse({
      message: `Rekonsiliasi selesai: ${summary.fulfilled} order dipenuhi.`,
      sweeps,
      ...summary,
    }, 200);
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Rekonsiliasi gagal.",
    }, 500);
  }
});

/**
 * Penjadwal memakai token bersama (`BILLING_RECONCILE_TOKEN`).
 *
 * Bila token belum dikonfigurasi, endpoint menolak semua permintaan (fail-closed):
 * fungsi ini bisa memberi kredit, jadi tidak boleh terbuka secara default.
 */
function verifySchedulerToken(request: Request) {
  const expected = Deno.env.get("BILLING_RECONCILE_TOKEN");
  if (!expected) {
    return jsonResponse({ message: "Rekonsiliasi belum dikonfigurasi." }, 503);
  }

  const provided = request.headers.get("x-reconcile-token")
    ?? new URL(request.url).searchParams.get("token");

  if (!provided || !timingSafeEqual(provided, expected)) {
    return jsonResponse({ message: "Token rekonsiliasi tidak valid." }, 401);
  }

  return null;
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

function clampNumber(raw: string | null, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    return fallback;
  }
  return Math.trunc(value);
}
