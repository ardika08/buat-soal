const SANDBOX_INVOICE = "https://api-sandbox.duitku.com/api/merchant/createInvoice";
const PRODUCTION_INVOICE = "https://api-prod.duitku.com/api/merchant/createInvoice";
const SANDBOX_STATUS = "https://sandbox.duitku.com/webapi/api/merchant/transactionStatus";
const PRODUCTION_STATUS = "https://passport.duitku.com/webapi/api/merchant/transactionStatus";
const REQUEST_TIMEOUT_MS = 15_000;

export function getDuitkuConfig() {
  const merchantCode = Deno.env.get("DUITKU_MERCHANT_CODE") ?? "DS37956";
  const apiKey = Deno.env.get("DUITKU_API_KEY");
  if (!apiKey) {
    throw new Error("DUITKU_API_KEY belum dikonfigurasi pada Edge Function.");
  }
  const mode = (Deno.env.get("DUITKU_MODE") ?? "sandbox").toLowerCase();
  if (mode !== "sandbox" && mode !== "production") {
    throw new Error("DUITKU_MODE harus bernilai sandbox atau production.");
  }
  return {
    merchantCode,
    apiKey,
    invoiceUrl: mode === "sandbox" ? SANDBOX_INVOICE : PRODUCTION_INVOICE,
    statusUrl: mode === "sandbox" ? SANDBOX_STATUS : PRODUCTION_STATUS,
  };
}

export async function createDuitkuInvoice(input: {
  orderId: number;
  amount: number;
  productDetails: string;
  customerName: string;
  email: string;
  phoneNumber: string;
  callbackUrl: string;
  returnUrl: string;
  expiryPeriod: number;
}) {
  const { merchantCode, apiKey, invoiceUrl } = getDuitkuConfig();
  const merchantOrderId = String(input.orderId);
  const timestamp = String(Date.now());
  // POP API: signature HMAC-SHA256 dari `merchantCode + timestamp`, dikirim lewat header.
  const signature = await sign(`${merchantCode}${timestamp}`, apiKey);
  const nameParts = splitName(input.customerName);
  const response = await duitkuFetch(invoiceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-duitku-merchantcode": merchantCode,
      "x-duitku-timestamp": timestamp,
      "x-duitku-signature": signature,
    },
    body: JSON.stringify({
      paymentAmount: input.amount,
      merchantOrderId,
      productDetails: input.productDetails,
      customerVaName: input.customerName.slice(0, 20),
      email: input.email,
      phoneNumber: input.phoneNumber,
      customerDetail: {
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        email: input.email,
        phoneNumber: input.phoneNumber,
      },
      itemDetails: [{ name: input.productDetails.slice(0, 50), price: input.amount, quantity: 1 }],
      callbackUrl: input.callbackUrl,
      returnUrl: input.returnUrl,
      expiryPeriod: input.expiryPeriod,
      paymentMethod: "",
    }),
  });

  const result = response as Record<string, unknown>;
  if (String(result.statusCode) !== "00" || typeof result.reference !== "string" || typeof result.paymentUrl !== "string") {
    throw new Error(typeof result.statusMessage === "string" ? result.statusMessage : "Duitku tidak mengembalikan tautan pembayaran.");
  }
  return {
    merchantOrderId,
    reference: result.reference,
    paymentUrl: result.paymentUrl,
  };
}

export async function getDuitkuTransaction(merchantOrderId: string) {
  const { merchantCode, apiKey, statusUrl } = getDuitkuConfig();
  const signature = await sign(`${merchantCode}${merchantOrderId}`, apiKey);
  const response = await duitkuFetch(statusUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantCode, merchantOrderId, signature }),
  });
  return response as Record<string, unknown>;
}

export async function verifyDuitkuCallback(payload: Record<string, string>) {
  const { merchantCode, apiKey } = getDuitkuConfig();
  if (payload.merchantCode !== merchantCode || !payload.amount || !payload.merchantOrderId || !payload.signature) {
    return false;
  }
  const expected = await sign(`${payload.merchantCode}${payload.amount}${payload.merchantOrderId}`, apiKey);
  return timingSafeEqual(expected, payload.signature.toLowerCase());
}

export { mapDuitkuStatus } from "./billing.ts";

async function duitkuFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message = payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).Message ?? (payload as Record<string, unknown>).statusMessage
        : null;
      throw new Error(typeof message === "string" ? message : `Duitku menolak permintaan (HTTP ${response.status}).`);
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("Duitku mengembalikan respons tidak valid.");
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function sign(value: string, apiKey: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function splitName(name: string) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return { firstName: firstName.slice(0, 50), lastName: rest.join(" ").slice(0, 50) };
}
