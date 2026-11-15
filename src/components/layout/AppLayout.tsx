import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { BrainCircuit, Coins, LogOut, Menu, UserCircle, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import AppStatsBar from "@/components/marketing/AppStatsBar";
import SalesProofWidget from "@/components/marketing/SalesProofWidget";
import WorkspaceSidebar from "@/components/layout/WorkspaceSidebar";
import { useAuth } from "@/lib/auth-context";
import { HOME_PATH, PROFILE_PATH } from "@/lib/routes";

export default function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        Langsung ke konten utama
      </a>

      {/* Sidebar tetap di layar lebar */}
      <WorkspaceSidebar className="hidden w-64 shrink-0 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start" />

      {/* Mode ringkas: drawer sidebar di layar kecil dengan focus trap & Escape */}
      <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm lg:hidden data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-[60] w-64 outline-none lg:hidden data-open:animate-in data-open:fade-in-0 motion-safe:data-open:slide-in-from-left duration-200">
            <DialogPrimitive.Title className="sr-only">Menu navigasi</DialogPrimitive.Title>
            <WorkspaceSidebar className="h-full shadow-xl" onNavigate={() => setMobileNavOpen(false)} />
            <DialogPrimitive.Close
              aria-label="Tutup menu"
              className="absolute right-2 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: hanya identitas + info akun. Navigasi utama ada di sidebar. */}
        <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md shadow-sm">
          <div className="container mx-auto flex h-16 items-center gap-3 px-4">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu"
              aria-expanded={mobileNavOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg border text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <Link
              to={HOME_PATH}
              className="flex items-center gap-2 rounded-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 motion-safe:hover:scale-105 motion-safe:active:scale-[0.96] lg:hidden"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-200">
                <BrainCircuit className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-xl font-bold text-transparent">
                GuruKit
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-3 sm:gap-4">
              {/* Credits Badge */}
              <Link
                to="/transactions"
                className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800 shadow-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5"
                title="Lihat riwayat kredit"
              >
                <Coins className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm font-semibold tabular-nums">{user?.credits_balance ?? 0} Kredit</span>
              </Link>

              <Link
                to={PROFILE_PATH}
                title={user?.name ? `Profil ${user.name}` : "Profil akun"}
                className="hidden items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 sm:flex"
              >
                <UserCircle className="h-6 w-6 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="max-w-44 truncate">{user?.name}</span>
              </Link>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => void logout()}
                aria-label="Keluar"
                title="Keluar"
                className="lg:hidden"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>

        {location.pathname === HOME_PATH && <AppStatsBar />}

        {/* Main Content Area */}
        <main id="main-content" className="flex-1 container mx-auto px-4 py-8 max-w-6xl scroll-mt-20">
          <Outlet />
        </main>

        <SalesProofWidget />

        {/* Simple Footer */}
        <footer className="border-t bg-white mt-auto py-6 text-center text-slate-500 text-sm">
          <p>© 2026 GuruKit. Solusi Cerdas Guru Indonesia.</p>
        </footer>
      </div>
    </div>
  );
}
