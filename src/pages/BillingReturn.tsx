import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { billingApi, type BillingPayment } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { paymentInvoiceNumber } from "@/lib/paymentIdentifiers";
import {
  describeOutcome,
  resolveOrderId,
  shouldKeepPolling,
  type PaymentTone,
} from "@/lib/billingReturn";

/** Jeda antar pemeriksaan status (ms). Beri waktu webhook Mayar masuk lebih dulu. */
const POLL_INTERVAL_MS = 3000;

/**
 * Halaman kembali dari pembayaran Mayar (`/billing/return?order_id=...`).
 *
 * Webhook adalah jalur utama pemenuhan kredit; halaman ini memantau status agar pengguna
 * melihat hasilnya tanpa menebak-nebak. Bila webhook belum sampai, setiap pemeriksaan
 * status juga merekonsiliasi invoice ke Mayar (lihat billing-payment-status), jadi
 * pembayaran yang benar-benar lunas tetap terpenuhi meski webhook gagal terkirim.
 */
export default function BillingReturn() {
  const { search } = useLocation();
  const { refreshUser } = useAuth();
  const [payment, setPayment] = useState<BillingPayment | null>(null);
  const [finished, setFinished] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Order id dibekukan saat halaman dibuka: kalau URL berubah karena polling/render,
  // halaman tidak boleh tiba-tiba memeriksa order milik orang lain.
  const [orderId] = useState<number | null>(() => {
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem("billing_last_order_id");
    return resolveOrderId(search, stored);
  });

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    const poll = async () => {
      attempts += 1;

      try {
        const res = await billingApi.checkPaymentStatus(orderId);
        if (cancelled) {
          return;
        }

        setPayment(res.data.payment);
        setCheckError(null);

        // Kredit/premium bisa baru terlihat setelah status final, jadi profil disegarkan.
        if (res.data.payment.status === "paid") {
          void refreshUser();
        }

        if (!shouldKeepPolling(res.data.payment.status, attempts)) {
          setFinished(true);
          return;
        }
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }

        const apiError = err as { response?: { data?: { message?: string } } };
        setCheckError(apiError.response?.data?.message ?? "Gagal memeriksa status pembayaran.");

        if (!shouldKeepPolling("pending", attempts)) {
          setFinished(true);
          return;
        }
      }

      timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [orderId, refreshUser]);

  // Selama order masih dipantau dan belum final, tampilkan status menunggu.
  const status = payment?.status ?? "pending";
  const isPolling = orderId !== null && !finished && shouldKeepPolling(status, 0);
  const outcome = describeOutcome(status);

  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card>
        <CardContent className="space-y-6 p-8 text-center">
          {orderId === null ? (
            <>
              <XCircle className="mx-auto h-12 w-12 text-red-500" />
              <div>
                <h1 className="text-xl font-bold text-slate-900">Pesanan tidak ditemukan</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Halaman ini tidak tahu pesanan mana yang harus diperiksa. Buka kembali tautan
                  pembayaran dari email/tagihan Mayar, atau cek saldo kredit Anda di dashboard.
                </p>
              </div>
            </>
          ) : (
            <>
              <StatusIcon tone={outcome.tone} busy={isPolling} />
              <div>
                <h1 className="text-xl font-bold text-slate-900">Status Pembayaran</h1>
                <p className="mt-2 text-sm text-slate-600">{outcome.message}</p>
                <p className="mt-1 text-xs text-slate-400">Invoice {paymentInvoiceNumber(orderId)}</p>
              </div>

              {payment && (
                <dl className="mx-auto grid max-w-sm grid-cols-2 gap-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm">
                  <dt className="text-slate-500">Jumlah</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {formatRupiah(payment.amount ?? 0)}
                  </dd>
                  <dt className="text-slate-500">Kredit</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {(payment.credits ?? 0).toLocaleString("id-ID")}
                  </dd>
                </dl>
              )}

              {checkError && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  {checkError}
                </p>
              )}
            </>
          )}

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              render={<Link to="/" />}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Ke Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" render={<Link to="/transactions" />}>
              Lihat Riwayat Transaksi
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusIcon({ tone, busy }: { tone: PaymentTone; busy: boolean }) {
  if (busy && tone === "pending") {
    return <Loader2 className="mx-auto h-12 w-12 animate-spin text-indigo-500" />;
  }

  if (tone === "success") {
    return <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />;
  }

  if (tone === "failed") {
    return <XCircle className="mx-auto h-12 w-12 text-red-500" />;
  }

  return <Clock className="mx-auto h-12 w-12 text-amber-500" />;
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
}
