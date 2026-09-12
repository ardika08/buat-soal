/**
 * Klien Mayar (https://docs.mayar.id/api-reference).
 *
 * API key HANYA dibaca dari environment Edge Function (`MAYAR_API_KEY`) dan tidak
 * pernah dikirim ke klien. Seluruh panggilan dilakukan dari sisi server.
 */

const PRODUCTION_BASE = "https://api.mayar.id/hl/v1";
const SANDBOX_BASE = "https://api.mayar.io/hl/v1";

export function getMayarApiKey() {
  const key = Deno.env.get("MAYAR_API_KEY");
  if (!key) {
    throw new Error("MAYAR_API_KEY belum dikonfigurasi pada Edge Function.");
  }
  return key;
}

export function getMayarBaseUrl() {
  const mode = (Deno.env.get("MAYAR_MODE") ?? "production").toLowerCase();
  return mode === "sandbox" ? SANDBOX_BASE : PRODUCTION_BASE;
}

/** Batas waktu semua panggilan keluar supaya webhook tidak menggantung. */
const REQUEST_TIMEOUT_MS = 15_000;

async function mayarFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getMayarBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${getMayarApiKey()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = extractMessage(payload) ?? `Mayar menolak permintaan (HTTP ${response.status}).`;
      throw new Error(message);
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

function extractMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const messages = record.messages ?? record.message;
  return typeof messages === "string" && messages.trim() !== "" ? messages : null;
}

export interface MayarInvoice {
  id: string;
  transactionId?: string;
  link?: string;
  paymentUrl?: string;
  amount?: number;
  status?: string;
  expiredAt?: number;
}

export interface CreateMayarInvoiceInput {
  name: string;
  email: string;
  mobile: string;
  redirectUrl: string;
  description: string;
  expiredAt: string;
  items: Array<{ quantity: number; rate: number; description: string }>;
  extraData?: Record<string, string>;
}

export async function createMayarInvoice(input: CreateMayarInvoiceInput): Promise<MayarInvoice> {
  const response = await mayarFetch<{ data?: MayarInvoice }>("/invoice/create", {
    method: "POST",
    body: JSON.stringify(input),
  });

  const invoice = response?.data;
  if (!invoice?.id) {
    throw new Error("Mayar tidak mengembalikan ID invoice.");
  }

  return invoice;
}

/**
 * Sumber kebenaran status pembayaran: selalu tanyakan ulang ke Mayar,
 * jangan pernah mempercayai payload webhook apa adanya.
 */
export async function getMayarInvoice(invoiceId: string): Promise<MayarInvoice> {
  const response = await mayarFetch<{ data?: MayarInvoice }>(`/invoice/${encodeURIComponent(invoiceId)}`);

  const invoice = response?.data;
  if (!invoice?.id) {
    throw new Error("Invoice Mayar tidak ditemukan.");
  }

  return invoice;
}
