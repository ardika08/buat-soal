import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Crown, Loader2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { billingApi, type BillingPackage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface BillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "topup" | "subscription";
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Isi dialog hidup di dalam DialogContent, yang hanya ter-mount saat dialog
 * terbuka. Efek sampingnya: seluruh state di sini lahir ulang setiap kali
 * dialog dibuka, jadi tidak perlu effect "reset saat open" yang menyalakan
 * setState berantai.
 */
function BillingPackagesPanel({
  defaultTab,
}: {
  defaultTab: "topup" | "subscription";
}) {
  const { user } = useAuth();
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [activeTab, setActiveTab] = useState<"topup" | "subscription">(defaultTab);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(
    () => localStorage.getItem("billing_customer_name") ?? user?.name ?? "",
  );
  const [customerEmail, setCustomerEmail] = useState(
    () => localStorage.getItem("billing_customer_email") ?? user?.email ?? "",
  );
  const [customerMobile, setCustomerMobile] = useState(
    () => localStorage.getItem("billing_customer_mobile") ?? "",
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    billingApi.packages()
      .then((res) => {
        if (isActive) {
          setPackages(res.data.packages);
        }
      })
      .catch(() => {
        if (isActive) {
          setError("Gagal memuat paket. Pastikan konfigurasi Supabase sudah benar.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const visiblePackages = useMemo(
    () => packages.filter((item) => item.type === activeTab),
    [packages, activeTab],
  );

  const handleCheckout = async (packageId: string) => {
    if (!customerName.trim()) {
      setError("Nama pembeli wajib diisi agar checkout Mayar bisa dibuat.");
      return;
    }

    if (!customerEmail.trim()) {
      setError("Email pembeli wajib diisi agar checkout Mayar bisa dibuat.");
      return;
    }

    if (!customerMobile.trim()) {
      setError("Nomor WhatsApp wajib diisi agar checkout Mayar bisa dibuat.");
      return;
    }

    setProcessingId(packageId);
    setMessage(null);
    setError(null);

    try {
      const res = await billingApi.checkout(packageId, {
        name: customerName.trim(),
        email: customerEmail.trim(),
        mobile: customerMobile.trim(),
      });
      localStorage.setItem("billing_customer_name", customerName.trim());
      localStorage.setItem("billing_customer_email", customerEmail.trim());
      localStorage.setItem("billing_customer_mobile", customerMobile.trim());
      // Halaman /billing/return memakai ini sebagai cadangan bila Mayar tidak
      // mengembalikan parameter order_id di URL kembali.
      localStorage.setItem("billing_last_order_id", String(res.data.payment.order_id));
      setMessage("Link pembayaran berhasil dibuat. Anda akan diarahkan ke halaman checkout Mayar.");

      if (res.data.payment.checkout_url) {
        window.location.assign(res.data.payment.checkout_url);
        return;
      }

      setError("Checkout dibuat, tetapi link pembayaran tidak ditemukan.");
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message ?? "Checkout Mayar gagal dibuat.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-2">
        <DialogTitle className="text-xl font-bold">Pilih Paket</DialogTitle>
        <DialogDescription>
          Top up untuk kebutuhan cepat, atau langganan premium untuk kuota besar dan model AI terbaik.
        </DialogDescription>
      </DialogHeader>

      <div className="px-6">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            className={`h-10 rounded-lg text-sm font-semibold transition-colors ${activeTab === "topup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            onClick={() => setActiveTab("topup")}
          >
            <Zap className="inline h-4 w-4 mr-1 text-amber-500" />
            Top Up Kredit
          </button>
          <button
            className={`h-10 rounded-lg text-sm font-semibold transition-colors ${activeTab === "subscription" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            onClick={() => setActiveTab("subscription")}
          >
            <Crown className="inline h-4 w-4 mr-1 text-indigo-500" />
            Langganan
          </button>
        </div>
      </div>

      <div className="px-6 pb-6 pt-4 space-y-4">
        <div className="rounded-xl border bg-slate-50 p-4">
          <label htmlFor="billing-name" className="block text-sm font-semibold text-slate-900">
            Data pembeli untuk checkout
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Data ini akan dikirim ke Mayar agar form checkout tidak kosong dan pengguna tidak perlu mengisi ulang sebanyak mungkin.
          </p>
          <Input
            id="billing-name"
            className="mt-3 bg-white"
            placeholder="Nama lengkap"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
          <Input
            id="billing-email"
            type="email"
            className="mt-3 bg-white"
            placeholder="Email aktif"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
          />
          <Input
            id="billing-mobile"
            className="mt-3 bg-white"
            placeholder="Contoh: 081234567890"
            value={customerMobile}
            onChange={(event) => setCustomerMobile(event.target.value)}
          />
        </div>

        {message && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid place-items-center py-10 text-slate-500">
            <Loader2 className="mb-2 h-5 w-5 animate-spin" />
            Memuat paket...
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visiblePackages.map((item) => (
              <div key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-slate-900">{item.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                  </div>
                  <div className="rounded-full bg-indigo-50 p-2 text-indigo-600">
                    {item.type === "subscription" ? <Crown className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                  </div>
                </div>

                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{formatRupiah(item.price)}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {item.credits.toLocaleString("id-ID")} kredit
                      {item.duration_months ? ` / ${item.duration_months} bulan` : ""}
                    </div>
                  </div>
                  <Button
                    onClick={() => void handleCheckout(item.id)}
                    disabled={processingId !== null || !customerName.trim() || !customerEmail.trim() || !customerMobile.trim()}
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    {processingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Bayar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500">
          Paket akan aktif otomatis setelah pembayaran Mayar terverifikasi.
        </p>
      </div>
    </>
  );
}

export default function BillingDialog({ open, onOpenChange, defaultTab = "topup" }: BillingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
        <BillingPackagesPanel defaultTab={defaultTab} />
      </DialogContent>
    </Dialog>
  );
}
