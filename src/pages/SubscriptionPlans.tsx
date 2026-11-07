import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Crown, Gift, Lock, CreditCard, X } from "lucide-react";
import BillingDialog from "@/components/billing/BillingDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { billingApi, type BillingPackage } from "@/lib/api";
import { buildEbookComparison } from "@/lib/ebookPlans";
import { loadEbookUpgradeIntent } from "@/lib/ebookUpgradeIntent";
import { EMODUL_ACCESS_PATH } from "@/lib/routes";

/**
 * Halaman paket langganan dengan manfaat E-Book.
 *
 * Menjelaskan isi tiap paket (Dasar & Premium) dan manfaat E-Book yang
 * dibundel. Pembelian tetap lewat BillingDialog (checkout Mayar) — tidak ada
 * sistem pembayaran terpisah. Harga mengikuti paket yang berlaku.
 */

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

const FREE_FEATURES = [
  { label: "Pembuatan soal dengan AI", included: true },
  { label: "Bank soal & riwayat ujian", included: true },
  { label: "E-Book & e-modul", included: false },
  { label: "Unduh PDF/DOCX modul", included: false },
];

const PREMIUM_FEATURES = [
  "Seluruh e-modul & bahan ajar",
  "Unduh PDF & DOCX tanpa batas",
  "Kop identitas sekolah",
  "Pembaruan struktur & konten modul",
];

export default function SubscriptionPlans() {
  const { user, refreshUser, updateUser } = useAuth();
  const navigate = useNavigate();
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingOpen, setBillingOpen] = useState(false);

  const isPremiumActive = Boolean(
    user
      && user.subscription_tier === "premium"
      && (!user.subscription_expiry || new Date(user.subscription_expiry) > new Date()),
  );

  const comparison = buildEbookComparison(packages);

  /**
   * Simulasi upgrade (lingkungan demo tanpa pembayaran): aktifkan premium lokal,
   * lalu lanjutkan alur E-Book bila ada niat upgrade yang tertunda.
   */
  const handleSimulateUpgrade = () => {
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 6);

    updateUser({
      subscription_tier: "premium",
      subscription_expiry: expiry.toISOString(),
    });

    const intent = loadEbookUpgradeIntent();
    navigate(intent ? intent.return_to : EMODUL_ACCESS_PATH);
  };

  useEffect(() => {
    let isActive = true;

    billingApi.packages()
      .then((res) => {
        if (isActive) {
          setPackages(res.data.packages.filter((item) => item.type === "subscription"));
        }
      })
      .catch(() => {
        if (isActive) {
          setError("Gagal memuat paket. Periksa koneksi lalu coba lagi.");
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <Link to={EMODUL_ACCESS_PATH}>
          <Button variant="ghost" className="mb-1 text-slate-500 hover:text-slate-900">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Akses E-Book
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Paket Langganan</h1>
        <p className="text-sm text-slate-500">
          E-Book dan e-modul dibundel ke paket yang sama dengan fitur Soal — tanpa
          sistem pembayaran terpisah.
        </p>
      </div>

      {isPremiumActive && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Anda sudah berlangganan Premium
          {user?.subscription_expiry && (
            <>
              {" "}hingga{" "}
              {new Date(user.subscription_expiry).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </>
          )}
          . Akses E-Book aktif.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {/* Paket Dasar */}
        <div className="flex flex-col rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">Paket Dasar</h2>
              <p className="mt-1 text-sm text-slate-500">Mulai tanpa biaya.</p>
            </div>
            <div className="rounded-full bg-slate-100 p-2 text-slate-500">
              <Gift className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-5">
            <span className="text-2xl font-bold text-slate-900">Gratis</span>
            {!isPremiumActive && (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Paket saat ini
              </span>
            )}
          </div>

          <ul className="mt-5 space-y-2.5 text-sm">
            {FREE_FEATURES.map((feature) => (
              <li key={feature.label} className="flex items-start gap-2">
                {feature.included ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                )}
                <span className={feature.included ? "text-slate-700" : "text-slate-400"}>
                  {feature.label}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 pt-4 text-xs text-slate-400">
            E-Book memerlukan paket Premium.
          </div>
        </div>

        {/* Paket Premium (dari billing) */}
        {isLoading && (
          <div className="flex items-center justify-center rounded-2xl border bg-white p-5 text-sm text-slate-500">
            Memuat paket…
          </div>
        )}

        {!isLoading && packages.map((item) => (
          <div
            key={item.id}
            className="flex flex-col rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/60 p-5 shadow-md shadow-emerald-100"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">{item.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{item.description}</p>
              </div>
              <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                <Crown className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5">
              <span className="text-2xl font-bold text-slate-900">{formatRupiah(item.price)}</span>
              <div className="mt-1 text-sm text-slate-500">
                {item.credits.toLocaleString("id-ID")} kredit
                {item.duration_months ? ` · ${item.duration_months} bulan` : ""}
              </div>
            </div>

            <ul className="mt-5 space-y-2.5 text-sm">
              {PREMIUM_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-slate-700">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex-1" />

            <Button
              onClick={() => setBillingOpen(true)}
              className="w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CreditCard className="mr-1.5 h-4 w-4" />
              {isPremiumActive ? "Perpanjang Paket" : "Pilih Paket"}
            </Button>
          </div>
        ))}
      </div>

      {/* Perbandingan batasan E-Book */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Perbandingan Batasan E-Book
        </h2>

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600">
                  Fitur E-Book
                </th>
                {comparison.columns.map((column, index) => (
                  <th
                    key={column}
                    className={`px-4 py-3 text-center font-semibold ${
                      index === 0 ? "text-slate-600" : "text-emerald-700"
                    }`}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.label} className="border-b last:border-b-0">
                  <td className="px-4 py-3 text-slate-700">{row.label}</td>
                  {row.cells.map((cell, index) => (
                    <td
                      key={index}
                      className={`px-4 py-3 text-center ${
                        index === 0 ? "text-slate-500" : "text-emerald-700"
                      }`}
                    >
                      {cell.kind === "check" ? (
                        <span className="inline-flex items-center justify-center">
                          <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          <span className="sr-only">Termasuk</span>
                        </span>
                      ) : cell.kind === "cross" ? (
                        <span className="inline-flex items-center justify-center">
                          <X className="h-4 w-4 text-slate-300" aria-hidden="true" />
                          <span className="sr-only">Tidak termasuk</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium">{cell.text}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500">
          Batasan E-Book mengikuti paket langganan; fitur Soal tetap tersedia di semua
          paket.
        </p>
      </div>

      {/* Simulasi upgrade (lingkungan demo) */}
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4">
        <p className="text-sm font-semibold text-indigo-800">Mode simulasi</p>
        <p className="mt-1 text-xs leading-5 text-indigo-700">
          Belum ada pembayaran di lingkungan demo. Aktifkan Premium secara lokal untuk
          mencoba alur resume setelah upgrade E-Book.
        </p>
        <Button
          onClick={handleSimulateUpgrade}
          variant="outline"
          className="mt-3 rounded-full border-indigo-200 text-indigo-700 hover:bg-indigo-100"
        >
          <Check className="mr-1.5 h-4 w-4" />
          Simulasikan Upgrade Berhasil
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Pembelian diproses lewat halaman pembayaran yang sama dengan top-up kredit.
          Harga dan isi paket mengikuti daftar yang berlaku; manfaat E-Book dapat
          disesuaikan pada tahap berikutnya.
        </p>
      </div>

      <BillingDialog
        open={billingOpen}
        onOpenChange={(open) => {
          setBillingOpen(open);
          if (!open) {
            void refreshUser();
          }
        }}
        defaultTab="subscription"
      />
    </div>
  );
}
