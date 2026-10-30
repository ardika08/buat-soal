import { FileText, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SubscriptionTier } from "@/lib/api";

interface CreditPackageSummaryProps {
  creditsBalance: number;
  subscriptionTier: SubscriptionTier;
  hasPurchasedCredits: boolean;
  totalQuestions: number;
  onTopUp: () => void;
  onUpgrade: () => void;
}

/**
 * Ringkasan kredit dan paket langganan guru.
 *
 * Menampilkan tiga kartu statistik (total soal, sisa kredit, paket aktif)
 * memakai komponen Card yang sudah ada. Aksi top-up dan upgrade diserahkan ke
 * pemanggil lewat callback supaya dialog Billing tetap dikelola di beranda.
 */
export default function CreditPackageSummary({
  creditsBalance,
  subscriptionTier,
  hasPurchasedCredits,
  totalQuestions,
  onTopUp,
  onUpgrade,
}: CreditPackageSummaryProps) {
  const isPremium = subscriptionTier === "premium";
  const packageLabel = isPremium ? "Premium Aktif" : hasPurchasedCredits ? "Kredit Top-Up" : "Paket Dasar";
  const packageBadge = isPremium ? "PREMIUM" : hasPurchasedCredits ? "AKTIF" : "FREE";
  const packageBadgeClass = isPremium
    ? "bg-purple-200 text-purple-800"
    : hasPurchasedCredits
      ? "bg-emerald-200 text-emerald-800"
      : "bg-indigo-200 text-indigo-800";

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <Card className="border-none shadow-md shadow-slate-200/50 transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Total Soal Dibuat</CardTitle>
          <FileText className="h-4 w-4 text-indigo-500" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-slate-900">{totalQuestions}</div>
          <p className="mt-1 text-xs text-slate-500">Dari riwayat tersimpan</p>
        </CardContent>
      </Card>

      <Card className="border-none shadow-md shadow-slate-200/50 transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">Sisa Kredit</CardTitle>
          <Zap className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-slate-900">{creditsBalance}</div>
          <button
            className="mt-1 flex cursor-pointer items-center gap-1 text-xs text-amber-600 hover:underline"
            onClick={onTopUp}
          >
            Top up kredit
          </button>
        </CardContent>
      </Card>

      <Card className="border-none bg-gradient-to-br from-indigo-50 to-purple-50 shadow-md shadow-slate-200/50 transition-shadow hover:shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-indigo-700">Paket Aktif</CardTitle>
          <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${packageBadgeClass}`}>
            {packageBadge}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold text-slate-900">{packageLabel}</div>
          <button
            className="mt-1 cursor-pointer text-xs text-indigo-600 hover:underline"
            onClick={onUpgrade}
          >
            {isPremium ? "Perpanjang Premium" : "Upgrade ke Premium"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
