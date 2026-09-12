import { buildBillingReturnUrl, findPackage, INVOICE_TTL_MINUTES } from "../_shared/billing.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createMayarInvoice } from "../_shared/mayar.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

/**
 * Membuat order pembayaran berstatus `pending` + invoice Mayar.
 *
 * PENTING: fungsi ini TIDAK memberi kredit, TIDAK mengaktifkan premium, dan TIDAK
 * memperpanjang langganan. Benefit hanya diberikan oleh `billing-webhook` setelah
 * pembayaran terverifikasi ke API Mayar (lihat fulfill_payment_order).
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
    const packageId = typeof body.package_id === "string" ? body.package_id : "";
    const selectedPackage = findPackage(packageId);

    if (!selectedPackage) {
      return jsonResponse({ message: "Paket tidak ditemukan." }, 404);
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

    const { data: pendingOrder } = await admin
      .from("payment_orders")
      .select("*")
      .eq("user_id", profile.id)
      .eq("package_id", selectedPackage.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingOrder?.checkout_url) {
      return jsonResponse({
        message: "Order pembayaran sudah dibuat. Lanjutkan pembayaran Anda.",
        package: selectedPackage,
        order: toPublicOrder(pendingOrder),
        payment: toPublicPayment(pendingOrder),
        user: toPublicUser(profile),
        reused: true,
      });
    }

    const expiredAt = new Date(Date.now() + INVOICE_TTL_MINUTES * 60_000);

    const { data: order, error: orderError } = await admin
      .from("payment_orders")
      .insert({
        user_id: profile.id,
        package_id: selectedPackage.id,
        order_type: selectedPackage.type,
        provider: "mayar",
        status: "pending",
        amount: selectedPackage.price,
        credits: selectedPackage.credits,
        duration_months: selectedPackage.duration_months,
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
      invoice = await createMayarInvoice({
        name: customerName,
        email: customerEmail,
        mobile: customerMobile,
        redirectUrl: buildRedirectUrl(request, Number(order.id)),
        description: `${selectedPackage.name} - ${selectedPackage.credits} kredit Soalify (order #${order.id})`,
        expiredAt: expiredAt.toISOString(),
        items: [
          {
            quantity: 1,
            rate: selectedPackage.price,
            description: selectedPackage.name,
          },
        ],
        extraData: {
          orderId: String(order.id),
          userId: String(profile.id),
          packageId: selectedPackage.id,
        },
      });
    } catch (error) {
      // Order tanpa invoice tidak berarti apa-apa: tandai gagal sebelum dilempar.
      await admin
        .from("payment_orders")
        .update({ status: "failed" })
        .eq("id", order.id);

      throw error;
    }

    const checkoutUrl = invoice.link ?? invoice.paymentUrl ?? null;

    const { data: updatedOrder, error: updateError } = await admin
      .from("payment_orders")
      .update({
        provider_order_id: invoice.id,
        provider_transaction_id: invoice.transactionId ?? null,
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
      package: selectedPackage,
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

function buildRedirectUrl(request: Request, orderId: number) {
  const configured = Deno.env.get("APP_BASE_URL");
  if (configured) {
    return buildBillingReturnUrl(configured, orderId);
  }

  const origin = request.headers.get("Origin") ?? request.headers.get("Referer") ?? "";
  try {
    const base = new URL(origin).origin;
    return buildBillingReturnUrl(base, orderId);
  } catch {
    return buildBillingReturnUrl("https://soalify.app", orderId);
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
