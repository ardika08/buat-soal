import { useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Clock3, Coins, Download, FileText, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { billingApi, type CreditTransaction, type PaymentOrder, type PaymentStatus } from "@/lib/api";
import { exportPaymentReceipt, paymentInvoiceNumber } from "@/lib/exportPaymentReceipt";
import { useAuth } from "@/lib/auth-context";

const STATUS: Record<PaymentStatus, { label: string; className: string }> = {
  pending: { label: "Menunggu", className: "bg-amber-50 text-amber-700" },
  paid: { label: "Lunas", className: "bg-emerald-50 text-emerald-700" },
  expired: { label: "Kedaluwarsa", className: "bg-slate-100 text-slate-600" },
  failed: { label: "Gagal", className: "bg-red-50 text-red-700" },
  cancelled: { label: "Dibatalkan", className: "bg-slate-100 text-slate-600" },
};

export default function TransactionHistory() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    billingApi.history()
      .then((response) => {
        setTransactions(response.data.transactions);
        setOrders(response.data.orders);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Gagal memuat riwayat transaksi.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const totals = useMemo(() => transactions.reduce(
    (result, transaction) => ({
      incoming: result.incoming + Math.max(0, transaction.amount),
      used: result.used + Math.abs(Math.min(0, transaction.amount)),
    }),
    { incoming: 0, used: 0 },
  ), [transactions]);

  const downloadReceipt = (order: PaymentOrder) => {
    try {
      exportPaymentReceipt(order);
      setMessage("Bukti pembayaran berhasil diunduh.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal mengunduh bukti pembayaran.");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <div className="mb-2 flex items-center gap-2 text-indigo-600">
          <ReceiptText className="h-5 w-5" />
          <span className="text-sm font-semibold">Transparansi Billing</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Riwayat Transaksi & Kredit</h1>
        <p className="mt-1 text-sm text-slate-500">Pantau pembayaran, kredit masuk, dan seluruh pemakaian kredit.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Saldo saat ini" value={user?.credits_balance ?? 0} icon={<Coins className="h-5 w-5" />} tone="amber" />
        <SummaryCard label="Total kredit masuk" value={totals.incoming} icon={<ArrowDownCircle className="h-5 w-5" />} tone="emerald" />
        <SummaryCard label="Total kredit terpakai" value={totals.used} icon={<ArrowUpCircle className="h-5 w-5" />} tone="indigo" />
      </div>

      {message && (
        <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.toLowerCase().includes("gagal") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {message}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="font-bold text-slate-900">Riwayat Pembayaran</h2>
          <p className="mt-1 text-xs text-slate-500">Invoice top-up dan langganan beserta status terakhir.</p>
        </div>
        {isLoading ? <Loading /> : orders.length === 0 ? <Empty text="Belum ada riwayat pembayaran." /> : (
          <div className="divide-y">
            {orders.map((order) => {
              const status = STATUS[order.status];
              return (
                <article key={order.id} className="grid gap-4 p-5 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-500" />
                      <p className="font-semibold text-slate-900">{paymentInvoiceNumber(order)}</p>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{packageName(order)} · {formatDate(order.created_at)}</p>
                    {order.provider_transaction_id && <p className="mt-1 truncate text-xs text-slate-400">ID transaksi: {order.provider_transaction_id}</p>}
                  </div>
                  <div className="md:text-right">
                    <p className="font-bold text-slate-900">{formatRupiah(order.amount)}</p>
                    <p className="text-xs text-slate-500">{order.credits.toLocaleString("id-ID")} kredit</p>
                  </div>
                  <div>
                    {order.status === "paid" ? (
                      <Button variant="outline" onClick={() => downloadReceipt(order)}>
                        <Download className="mr-2 h-4 w-4" />Unduh Bukti
                      </Button>
                    ) : order.status === "pending" && safeCheckoutUrl(order.checkout_url) ? (
                      <Button variant="outline" render={<a href={safeCheckoutUrl(order.checkout_url) ?? undefined} target="_blank" rel="noreferrer" />}>
                        <Clock3 className="mr-2 h-4 w-4" />Bayar
                      </Button>
                    ) : <span className="text-xs text-slate-400">Bukti belum tersedia</span>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="font-bold text-slate-900">Mutasi Kredit</h2>
          <p className="mt-1 text-xs text-slate-500">Semua kredit masuk dan terpakai, termasuk bonus dan regenerasi.</p>
        </div>
        {isLoading ? <Loading /> : transactions.length === 0 ? <Empty text="Belum ada mutasi kredit." /> : (
          <div className="divide-y">
            {transactions.map((transaction) => {
              const incoming = transaction.amount >= 0;
              return (
                <article key={transaction.id} className="flex items-center gap-4 p-5">
                  <div className={`rounded-full p-2 ${incoming ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"}`}>
                    {incoming ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{transaction.description || transactionLabel(transaction)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(transaction.created_at)} · {transactionLabel(transaction)}</p>
                  </div>
                  <p className={`whitespace-nowrap font-bold ${incoming ? "text-emerald-600" : "text-indigo-600"}`}>
                    {incoming ? "+" : "-"}{Math.abs(transaction.amount).toLocaleString("id-ID")}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "amber" | "emerald" | "indigo" }) {
  const colors = { amber: "bg-amber-50 text-amber-700", emerald: "bg-emerald-50 text-emerald-700", indigo: "bg-indigo-50 text-indigo-700" };
  return <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className={`inline-flex rounded-full p-2 ${colors[tone]}`}>{icon}</div><p className="mt-3 text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value.toLocaleString("id-ID")}</p></div>;
}

function Loading() { return <div className="p-8 text-center text-sm text-slate-500">Memuat riwayat...</div>; }
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-sm text-slate-500">{text}</div>; }
function formatRupiah(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function packageName(order: PaymentOrder) { return order.order_type === "subscription" ? `Langganan ${order.duration_months ?? ""} bulan`.trim() : `Top-up ${order.credits.toLocaleString("id-ID")} kredit`; }
function transactionLabel(transaction: CreditTransaction) { return ({ topup: "Top-up kredit", subscription: "Langganan", deduction: "Pemakaian kredit", bonus: "Bonus kredit" })[transaction.type]; }
function safeCheckoutUrl(value: string | null) { try { const url = new URL(value ?? ""); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; } catch { return null; } }
