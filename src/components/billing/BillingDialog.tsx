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
import { billingApi, type BillingPackage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface BillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "topup" | "subscription";
}

export default function BillingDialog({ open, onOpenChange, defaultTab = "topup" }: BillingDialogProps) {
  const { updateUser } = useAuth();
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [activeTab, setActiveTab] = useState<"topup" | "subscription">(defaultTab);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab(defaultTab);
    setMessage(null);
    setError(null);
    setIsLoading(true);
    billingApi.packages()
      .then((res) => setPackages(res.data.packages))
      .catch(() => setError("Gagal memuat paket. Pastikan konfigurasi Supabase sudah benar."))
      .finally(() => setIsLoading(false));
  }, [open, defaultTab]);

  const visiblePackages = useMemo(
    () => packages.filter((item) => item.type === activeTab),
    [packages, activeTab],
  );

  const formatRupiah = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);

  const handleCheckout = async (packageId: string) => {
    setProcessingId(packageId);
    setMessage(null);
    setError(null);

    try {
      const res = await billingApi.checkout(packageId);
      updateUser(res.data.user);
      setMessage(res.data.message);
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(apiError.response?.data?.message ?? "Paket gagal diaktifkan.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
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
                      disabled={processingId !== null}
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      {processingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Aktifkan
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500">
            Mode saat ini mengaktifkan paket langsung untuk kebutuhan MVP. Integrasi pembayaran bisa disambungkan ke endpoint ini.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
