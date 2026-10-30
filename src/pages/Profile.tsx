import { Coins, Mail, Sparkles, UserCircle, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

export default function Profile() {
  const { user } = useAuth();

  const tier = user?.subscription_tier === "premium"
    ? "Premium"
    : user?.has_purchased_credits
      ? "Kredit Top-Up"
      : "Paket Dasar";

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profil Akun</h1>
        <p className="text-sm text-slate-500">Ringkasan identitas, kredit, dan paket langganan Anda.</p>
      </div>

      <Card className="border-none shadow-md shadow-slate-200/50">
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-200">
            <UserCircle className="h-8 w-8" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-slate-900">{user?.name ?? "Guru"}</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {user?.email ?? "—"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Coins className="h-4 w-4 text-amber-500" />
              Sisa Kredit
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-900">{user?.credits_balance ?? 0}</p>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Paket Aktif
            </div>
            <p className="mt-1 text-lg font-bold text-slate-900">{tier}</p>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Zap className="h-4 w-4 text-purple-500" />
              Status
            </div>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {user?.subscription_tier === "premium" ? "Berlangganan" : "Gratis"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
