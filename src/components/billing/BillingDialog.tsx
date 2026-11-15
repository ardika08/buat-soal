import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Crown, Loader2, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { billingApi, type BillingPackage, type BillingCheckoutResponse, CUSTOM_CREDIT_RATE, CUSTOM_TOPUP_MIN, CUSTOM_TOPUP_MAX } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface BillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "topup" | "subscription";
}

interface BillingTopupPageProps {
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
  standalone = false,
}: {
  defaultTab: "topup" | "subscription";
  standalone?: boolean;
}) {
  const { user } = useAuth();
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [activeTab, setActiveTab] = useState<"topup" | "subscription">(defaultTab);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [checkoutStage, setCheckoutStage] = useState<"creating" | "redirecting" | null>(null);
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
  const [customCredits, setCustomCredits] = useState<number>(50);

  useEffect(() => {
    if (standalone) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [standalone]);

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

  const subscriptionPackages = useMemo(
    () => packages.filter((item) => item.type === "subscription"),
    [packages],
  );

  const parsedCredits = Number.isFinite(customCredits) ? Math.floor(customCredits) : 0;
  const customAmount = Math.max(0, parsedCredits) * CUSTOM_CREDIT_RATE;
  const customCreditsValid =
    Number.isFinite(customCredits) && customCredits >= CUSTOM_TOPUP_MIN && customCredits <= CUSTOM_TOPUP_MAX;

  const performCheckout = async (
    processingKey: string,
    checkoutFn: () => Promise<{ data: BillingCheckoutResponse }>,
  ) => {
    if (!customerName.trim()) {
      setError("Nama pembeli wajib diisi agar checkout Duitku bisa dibuat.");
      return;
    }

    if (!customerEmail.trim()) {
      setError("Email pembeli wajib diisi agar checkout Duitku bisa dibuat.");
      return;
    }

    if (!customerMobile.trim()) {
      setError("Nomor WhatsApp wajib diisi agar checkout Duitku bisa dibuat.");
      return;
    }

    setProcessingId(processingKey);
    setCheckoutStage("creating");
    setMessage(null);
    setError(null);

    try {
      const res = await checkoutFn();
      localStorage.setItem("billing_customer_name", customerName.trim());
      localStorage.setItem("billing_customer_email", customerEmail.trim());
      localStorage.setItem("billing_customer_mobile", customerMobile.trim());
      // Halaman /billing/return memakai ini sebagai cadangan bila Duitku tidak
      // mengembalikan parameter order_id di URL kembali.
      localStorage.setItem("billing_last_order_id", String(res.data.payment.order_id));
      setMessage("Link pembayaran berhasil dibuat. Anda akan diarahkan ke halaman checkout Duitku.");

      if (res.data.payment.checkout_url) {
        setCheckoutStage("redirecting");
        window.location.assign(res.data.payment.checkout_url);
        return;
      }

      setError("Checkout dibuat, tetapi link pembayaran tidak ditemukan.");
      setProcessingId(null);
      setCheckoutStage(null);
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { message?: string } } };
      setError(
        apiError.response?.data?.message ??
          "Checkout pembayaran gagal dibuat. Periksa kembali data pembeli lalu coba lagi.",
      );
      setProcessingId(null);
      setCheckoutStage(null);
    }
  };

  const handleCheckout = (packageId: string) =>
    performCheckout(packageId, () =>
      billingApi.checkout(packageId, {
        name: customerName.trim(),
        email: customerEmail.trim(),
        mobile: customerMobile.trim(),
      }),
    );

  const handleCustomCheckout = () =>
    performCheckout("custom-topup", () =>
      billingApi.checkoutCustomCredits(parsedCredits, {
        name: customerName.trim(),
        email: customerEmail.trim(),
        mobile: customerMobile.trim(),
      }),
    );

  return (
    <>
      {standalone ? (
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-slate-900">Top Up Kredit</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pilih paket kredit atau tentukan jumlah top-up yang Anda butuhkan.
          </p>
        </div>
      ) : (
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle className="text-xl font-bold">Pilih Paket</DialogTitle>
          <DialogDescription className="text-slate-600">
            Top up untuk kebutuhan cepat, atau langganan premium untuk kuota besar dan model AI terbaik.
          </DialogDescription>
        </DialogHeader>
      )}

      <div className={standalone ? "mb-4" : "px-6"}>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "topup" | "subscription")}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <TabsTrigger value="topup" className="min-h-10 rounded-lg text-slate-700 data-active:text-slate-900">
              <Zap className="h-4 w-4 text-amber-700" aria-hidden="true" />
              Top Up Kredit
            </TabsTrigger>
            <TabsTrigger value="subscription" className="min-h-10 rounded-lg text-slate-700 data-active:text-slate-900">
              <Crown className="h-4 w-4 text-indigo-700" aria-hidden="true" />
              Langganan
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className={standalone ? "space-y-4" : "px-6 pb-6 pt-4 space-y-4"}>
        <fieldset className="rounded-xl border bg-slate-50 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">
            Data pembeli untuk checkout
          </legend>
          <p className="mt-1 text-xs text-slate-600">
            Data ini akan dikirim ke Duitku untuk membuat checkout pembayaran.
          </p>
          <label htmlFor="billing-name" className="mt-3 block text-xs font-medium text-slate-700">
            Nama lengkap
          </label>
          <Input
            id="billing-name"
            name="name"
            autoComplete="name"
            className="mt-1 bg-white"
            placeholder="Nama lengkap"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
          <label htmlFor="billing-email" className="mt-3 block text-xs font-medium text-slate-700">
            Email aktif
          </label>
          <Input
            id="billing-email"
            name="email"
            type="email"
            autoComplete="email"
            className="mt-1 bg-white"
            placeholder="nama@contoh.com"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
          />
          <label htmlFor="billing-mobile" className="mt-3 block text-xs font-medium text-slate-700">
            Nomor WhatsApp
          </label>
          <Input
            id="billing-mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="mt-1 bg-white"
            placeholder="081234567890"
            value={customerMobile}
            onChange={(event) => setCustomerMobile(event.target.value)}
          />
        </fieldset>

        {message && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {message}
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid place-items-center py-10 text-slate-600">
            <Loader2 className="mb-2 h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span role="status">Memuat paket…</span>
          </div>
        ) : activeTab === "topup" ? (
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-900">Top Up Kredit</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Pilih jumlah kredit sesuai kebutuhan. Tarif flat {formatRupiah(CUSTOM_CREDIT_RATE)} per kredit.
                </p>
              </div>
              <div className="rounded-full bg-indigo-50 p-2 text-indigo-700">
                <CreditCard className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="custom-credits" className="block text-sm font-semibold text-slate-900">
                  Jumlah kredit
                </label>
                <Input
                  id="custom-credits"
                  name="custom-credits"
                  type="number"
                  inputMode="numeric"
                  min={CUSTOM_TOPUP_MIN}
                  max={CUSTOM_TOPUP_MAX}
                  step={10}
                  className="mt-2 bg-white"
                  placeholder={`Min. ${CUSTOM_TOPUP_MIN}`}
                  value={Number.isFinite(customCredits) ? customCredits : ""}
                  onChange={(event) => setCustomCredits(Number(event.target.value))}
                />
                <p className="mt-1 text-xs text-slate-600">
                  Minimal {CUSTOM_TOPUP_MIN} dan maksimal {CUSTOM_TOPUP_MAX.toLocaleString("id-ID")} kredit.
                </p>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900">{formatRupiah(customAmount)}</div>
                  <div className="mt-1 text-sm tabular-nums text-slate-600">
                    {parsedCredits.toLocaleString("id-ID")} kredit × {formatRupiah(CUSTOM_CREDIT_RATE)}
                  </div>
                </div>
                <Button
                  onClick={() => void handleCustomCheckout()}
                  disabled={processingId !== null || !customerName.trim() || !customerEmail.trim() || !customerMobile.trim() || !customCreditsValid}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {processingId === "custom-topup" ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <Wallet className="h-4 w-4" aria-hidden="true" />
                  )}
                  {processingId === "custom-topup" ? "Memproses…" : "Bayar"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {subscriptionPackages.map((item) => (
              <div key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-slate-900">{item.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  </div>
                  <div className="rounded-full bg-indigo-50 p-2 text-indigo-700">
                    {item.type === "subscription" ? (
                      <Crown className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <CreditCard className="h-5 w-5" aria-hidden="true" />
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold tabular-nums text-slate-900">{formatRupiah(item.price)}</div>
                    <div className="mt-1 text-sm tabular-nums text-slate-600">
                      {item.credits.toLocaleString("id-ID")} kredit
                      {item.duration_months ? ` / ${item.duration_months} bulan` : ""}
                    </div>
                  </div>
                  <Button
                    onClick={() => void handleCheckout(item.id)}
                    disabled={processingId !== null || !customerName.trim() || !customerEmail.trim() || !customerMobile.trim()}
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    {processingId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                      <CreditCard className="h-4 w-4" aria-hidden="true" />
                    )}
                    {processingId === item.id ? "Memproses…" : "Bayar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-600">
          Paket akan aktif otomatis setelah pembayaran Duitku terverifikasi.
        </p>
      </div>

      {checkoutStage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-[2px] animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {checkoutStage === "creating"
                ? "Menyiapkan tagihan pembayaran…"
                : "Mengalihkan ke halaman Duitku…"}
            </h3>
            <p className="mt-1.5 text-sm text-slate-600">
              {checkoutStage === "creating"
                ? "Mohon tunggu sebentar, sedang membuat sesi checkout Anda."
                : "Halaman pembayaran sedang dibuka. Jangan tutup atau muat ulang halaman ini."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export function BillingTopupPage({ defaultTab = "topup" }: BillingTopupPageProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 animate-in fade-in motion-safe:slide-in-from-bottom-4 duration-500">
      <BillingPackagesPanel defaultTab={defaultTab} standalone />
    </div>
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
