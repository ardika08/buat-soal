import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  FileDown,
  Lock,
  School,

} from "lucide-react";
import BillingDialog from "@/components/billing/BillingDialog";
import EbookUpgradeDialog from "@/components/emodul/EbookUpgradeDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { EMODUL_NEW_PATH, EMODUL_PATH, PLANS_PATH } from "@/lib/routes";

/**
 * Halaman akses E-Book.
 *
 * E-book/e-modul dibundel ke paket langganan. Halaman ini menampilkan status
 * akses guru berdasarkan langganan, manfaat yang didapat, dan ajakan upgrade
 * untuk pengguna gratis. Data manfaat & paket masih tiruan sampai endpoint
 * entitlement/paket tersedia.
 */

const BENEFITS = [
  {
    icon: BookOpen,
    title: "Seluruh E-Modul & bahan ajar",
    description: "Buka semua modul yang tersedia di pustaka materi.",
  },
  {
    icon: FileDown,
    title: "Unduh PDF & DOCX",
    description: "Unduh materi siap cetak atau diedit tanpa batas.",
  },
  {
    icon: School,
    title: "Kop identitas sekolah",
    description: "Dokumen memakai kop resmi sekolah Anda.",
  },
  {
    icon: BookOpen,
    title: "Pembaruan materi",
    description: "Dapatkan pembaruan struktur dan konten modul.",
  },
];

export default function EbookAccess() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [billingOpen, setBillingOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  /**
   * Mock langganan mengikuti data akun yang ada: premium tanpa tanggal
   * kedaluwarsa berlaku selamanya; premium kedaluwarsa dianggap free.
   */
  const isPremiumActive = Boolean(
    user
      && user.subscription_tier === "premium"
      && (!user.subscription_expiry || new Date(user.subscription_expiry) > new Date()),
  );

  const tierLabel = isPremiumActive
    ? "Premium"
    : user?.has_purchased_credits
      ? "Kredit Top-Up"
      : "Paket Dasar";

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Akses E-Book</h1>
        <p className="text-sm text-slate-500">
          E-book dan e-modul dibundel ke paket langganan yang sama dengan fitur Soal.
        </p>
      </div>

      {/* Status akses */}
      <div
        className={`rounded-2xl border p-6 shadow-sm ${
          isPremiumActive
            ? "border-emerald-200 bg-emerald-50/70"
            : "border-amber-200 bg-amber-50/70"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ${
                isPremiumActive
                  ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                  : "bg-gradient-to-br from-amber-500 to-orange-500"
              }`}
            >
              {isPremiumActive ? <CheckCircle2 className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900">
                {isPremiumActive ? "Akses E-Book aktif" : "E-Book belum terbuka"}
              </h2>
              <p className="max-w-lg text-sm leading-6 text-slate-600">
                {isPremiumActive
                  ? "Paket Premium Anda mencakup seluruh e-modul, unduhan PDF/DOCX, dan kop sekolah."
                  : "E-Book tersedia untuk paket Premium. Tingkatkan paket untuk menyusun, membuka, dan mengunduh e-modul."}
              </p>
              {isPremiumActive && user?.subscription_expiry && (
                <p className="text-xs text-emerald-700">
                  Berlaku hingga{" "}
                  {new Date(user.subscription_expiry).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-600 ring-1 ring-slate-200">
              {tierLabel}
            </span>

            {!isPremiumActive && (
              <Button
                onClick={() => setUpgradeOpen(true)}
                className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Upgrade ke Premium
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Manfaat E-Book */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Manfaat E-Book di paket langganan
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <benefit.icon className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{benefit.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pintasan */}
      <div className="flex flex-wrap gap-3">
        <Link to={EMODUL_NEW_PATH}>
          <Button className="rounded-full bg-indigo-600 text-white hover:bg-indigo-700">
            <BookOpen className="mr-1.5 h-4 w-4" />
            Buat E-Modul
          </Button>
        </Link>
        <Link to={EMODUL_PATH}>
          <Button variant="outline" className="rounded-full">
            <BookOpen className="mr-1.5 h-4 w-4" />
            Pustaka E-Modul
          </Button>
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Paket, manfaat, dan pemeriksaan hak akses masih data tiruan. Harga tiap paket
        ditentukan pada tahap berikutnya.
      </div>

      <EbookUpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        onViewPackages={() => {
          setUpgradeOpen(false);
          navigate(PLANS_PATH);
        }}
      />

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
