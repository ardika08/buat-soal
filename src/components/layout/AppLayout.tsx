import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { BrainCircuit, Coins, LogOut, Menu, UserCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppStatsBar from "@/components/marketing/AppStatsBar";
import SalesProofWidget from "@/components/marketing/SalesProofWidget";
import WorkspaceSidebar from "@/components/layout/WorkspaceSidebar";
import { useAuth } from "@/lib/auth-context";
import { HOME_PATH } from "@/lib/routes";

export default function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Sidebar tetap di layar lebar */}
      <WorkspaceSidebar className="hidden w-64 shrink-0 lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start" />

      {/* Mode ringkas: drawer sidebar di layar kecil */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-64 animate-in slide-in-from-left duration-200">
            <WorkspaceSidebar className="h-full shadow-xl" onNavigate={() => setMobileNavOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Tutup menu"
              className="absolute right-2 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: hanya identitas + info akun. Navigasi utama ada di sidebar. */}
        <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md shadow-sm">
          <div className="container mx-auto flex h-16 items-center gap-3 px-4">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border text-slate-600 transition-colors hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link
              to={HOME_PATH}
              className="flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 lg:hidden"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-200">
                <BrainCircuit className="h-6 w-6 text-white" />
              </div>
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-xl font-bold text-transparent">
                Soalify
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-4">
              {/* Credits Badge */}
              <Link
                to="/transactions"
                className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700 shadow-sm transition-transform hover:-translate-y-0.5"
                title="Lihat riwayat kredit"
              >
                <Coins className="h-4 w-4" />
                <span className="text-sm font-semibold">{user?.credits_balance ?? 0} Kredit</span>
              </Link>

              <div className="hidden items-center gap-2 text-sm text-slate-600 sm:flex">
                <UserCircle className="h-7 w-7 text-slate-400" />
                <span className="max-w-36 truncate">{user?.name}</span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => void logout()}
                title="Logout"
                className="lg:hidden"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {location.pathname === HOME_PATH && <AppStatsBar />}

        {/* Main Content Area */}
        <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
          <Outlet />
        </main>

        <SalesProofWidget />

        {/* Simple Footer */}
        <footer className="border-t bg-white mt-auto py-6 text-center text-slate-500 text-sm">
          <p>© 2026 Soalify. Solusi Cerdas Guru Indonesia.</p>
        </footer>
      </div>
    </div>
  );
}
