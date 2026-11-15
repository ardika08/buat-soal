import { buildBillingReturnUrl, INVOICE_TTL_MINUTES, resolveCheckoutInput, CUSTOM_TOPUP_PACKAGE_ID } from "../_shared/billing.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createDuitkuInvoice, getDuitkuTransaction, mapDuitkuStatus } from "../_shared/duitku.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

/**
 * Membuat order pembayaran berstatus `pending` + invoice Duitku.
 *
 * PENTING: fungsi ini TIDAK memberi kredit, TIDAK mengaktifkan premium, dan TIDAK
 * memperpanjang langganan. Benefit hanya diberikan oleh `billing-webhook` setelah
 * pembayaran terverifikasi melalui API Duitku (lihat fulfill_payment_order).
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
    const resolved = resolveCheckoutInput(body);

    if (!resolved) {
      return jsonResponse({ message: "Paket atau jumlah kredit tidak valid." }, 404);
    }

    const customerName = normalizeText(body.customer_name);
    const customerEmail = normalizeText(body.customer_email);
    const customerMobile = normalizeText(body.customer_mobile);

    const invalid = validateCustomer(customerName, customerEmail, customerMobile);
    if (invalid) {
      return jsonResponse({ message: invalid }, 422);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("auth_user_id", auth.user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ message: "Profil pengguna tidak ditemukan." }, 404);
    }

    // Cegah tumpukan order pending: satu order terbuka per pengguna per paket.
    await expireStaleOrders(admin, Number(profile.id));

    let pendingOrderQuery = admin
      .from("payment_orders")
      .select("*")
      .eq("user_id", profile.id)
      .eq("package_id", resolved.packageId)
      .eq("provider", "duitku")
      .eq("status", "pending");

    if (resolved.packageId === CUSTOM_TOPUP_PACKAGE_ID) {
      pendingOrderQuery = pendingOrderQuery.eq("credits", resolved.credits);
    }

    const { data: pendingOrder } = await pendingOrderQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingOrder?.checkout_url && pendingOrder.provider_order_id) {
      const stillOpen = await isDuitkuOrderStillPending(
        String(pendingOrder.provider_order_id),
        Number(pendingOrder.amount),
      );

      if (stillOpen) {
        return jsonResponse({
          message: "Order pembayaran sudah dibuat. Lanjutkan pembayaran Anda.",
          package: toPublicPackage(resolved),
          order: toPublicOrder(pendingOrder),
          payment: toPublicPayment(pendingOrder),
          user: toPublicUser(profile),
          reused: true,
        });
      }

      // Invoice lama sudah lunas/batal/kedaluwarsa di Duitku: tutup agar order baru bersih.
      await admin
        .from("payment_orders")
        .update({ status: "expired" })
        .eq("id", pendingOrder.id);
    }

    const expiredAt = new Date(Date.now() + INVOICE_TTL_MINUTES * 60_000);

    const { data: order, error: orderError } = await admin
      .from("payment_orders")
      .insert({
        user_id: profile.id,
        package_id: resolved.packageId,
        order_type: resolved.orderType,
        provider: "duitku",
        status: "pending",
        amount: resolved.amount,
        credits: resolved.credits,
        duration_months: resolved.durationMonths,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_mobile: customerMobile,
      })
      .select("*")
      .single();

    if (orderError || !order) {
      throw orderError ?? new Error("Gagal membuat order pembayaran.");
    }

    let invoice;
    try {
      invoice = await createDuitkuInvoice({
        orderId: Number(order.id),
        amount: resolved.amount,
        productDetails: `${resolved.name} - ${resolved.credits} kredit GuruKit`,
        customerName,
        email: customerEmail,
        phoneNumber: customerMobile,
        callbackUrl: buildCallbackUrl(request),
        returnUrl: buildRedirectUrl(request, Number(order.id)),
        expiryPeriod: Math.max(5, Math.floor((expiredAt.getTime() - Date.now()) / 60_000)),
      });
    } catch (error) {
      // Order tanpa invoice tidak berarti apa-apa: tandai gagal sebelum dilempar.
      await admin
        .from("payment_orders")
        .update({ status: "failed" })
        .eq("id", order.id);

      throw error;
    }

    const checkoutUrl = invoice.paymentUrl;

    const { data: updatedOrder, error: updateError } = await admin
      .from("payment_orders")
      .update({
        provider_order_id: invoice.merchantOrderId,
        provider_transaction_id: invoice.reference,
        checkout_url: checkoutUrl,
      })
      .eq("id", order.id)
      .select("*")
      .single();

    if (updateError || !updatedOrder) {
      throw updateError ?? new Error("Gagal menyimpan data invoice.");
    }

    return jsonResponse({
      message: "Order pembayaran dibuat. Selesaikan pembayaran untuk mengaktifkan kredit.",
      package: toPublicPackage(resolved),
      order: toPublicOrder(updatedOrder),
      payment: toPublicPayment(updatedOrder),
      user: toPublicUser(profile),
      reused: false,
    }, 201);
  } catch (error) {
    return jsonResponse({
      message: error instanceof Error ? error.message : "Checkout gagal.",
    }, 500);
  }
});

function validateCustomer(name: string, email: string, mobile: string) {
  if (name.length < 2 || name.length > 120) {
    return "Nama pembeli minimal 2 karakter.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    return "Email pembeli tidak valid.";
  }

  const digits = mobile.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 20) {
    return "Nomor WhatsApp pembeli tidak valid.";
  }

  return null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Tandai order pending yang invoice-nya sudah kedaluwarsa supaya tidak menumpuk. */
async function expireStaleOrders(admin: ReturnType<typeof createAdminClient>, profileId: number) {
  await admin
    .from("payment_orders")
    .update({ status: "expired" })
    .eq("user_id", profileId)
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - INVOICE_TTL_MINUTES * 60_000).toISOString());
}

async function isDuitkuOrderStillPending(merchantOrderId: string, expectedAmount: number) {
  const transaction = await getDuitkuTransaction(merchantOrderId);
  return mapDuitkuStatus(transaction.statusCode) === "pending"
    && Number(transaction.amount) === expectedAmount;
}

function buildCallbackUrl(request: Request) {
  const configured = Deno.env.get("SUPABASE_URL");
  const base = configured ?? new URL(request.url).origin;
  return `${base.replace(/\/+$/, "")}/functions/v1/billing-webhook`;
}

function buildRedirectUrl(request: Request, orderId: number) {
  const origin = request.headers.get("Origin") ?? request.headers.get("Referer") ?? "";
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return buildBillingReturnUrl(parsed.origin, orderId);
    }
  } catch {
    // Abaikan header Origin/Referer yang tidak valid dan gunakan APP_BASE_URL.
  }

  const configured = Deno.env.get("APP_BASE_URL");
  if (configured) {
    return buildBillingReturnUrl(configured, orderId);
  }

  return buildBillingReturnUrl("https://gurukit.web.id", orderId);
}

function toPublicPackage(resolved: { packageId: string; orderType: string; credits: number; amount: number; name: string; durationMonths: number | null }) {
  return {
    id: resolved.packageId,
    type: resolved.orderType,
    name: resolved.name,
    description: resolved.name,
    credits: resolved.credits,
    price: resolved.amount,
    duration_months: resolved.durationMonths,
  };
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
    paid_at: order.paid_at,
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
