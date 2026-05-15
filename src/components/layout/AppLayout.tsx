import { Outlet, Link, useLocation } from "react-router-dom";
import { BrainCircuit, Coins, LogOut, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export default function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 transition-transform hover:scale-105 active:scale-95">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-200">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
              Soalify
            </span>
          </Link>

          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
              <Link
                to="/"
                className={`px-3 py-2 rounded-lg transition-colors ${
                  location.pathname === "/"
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/generate"
                className={`px-3 py-2 rounded-lg transition-colors ${
                  location.pathname === "/generate"
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                Buat Soal
              </Link>
              <Link
                to="/history"
                className={`px-3 py-2 rounded-lg transition-colors ${
                  location.pathname === "/history"
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                Riwayat
              </Link>
            </nav>

            <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

            <div className="flex items-center gap-4">
              {/* Credits Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 shadow-sm transition-transform hover:-translate-y-0.5 cursor-pointer" title="Sisa Kredit Anda">
                <Coins className="w-4 h-4" />
                <span className="font-semibold text-sm">{user?.credits_balance ?? 0} Kredit</span>
              </div>

              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600">
                <UserCircle className="w-7 h-7 text-slate-400" />
                <span className="max-w-36 truncate">{user?.name}</span>
              </div>

              <Button variant="ghost" size="icon" onClick={() => void logout()} title="Logout">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <Outlet />
      </main>

      {/* Simple Footer */}
      <footer className="border-t bg-white mt-auto py-6 text-center text-slate-500 text-sm">
        <p>© 2026 Soalify. Solusi Cerdas Guru Indonesia.</p>
      </footer>
    </div>
  );
}
