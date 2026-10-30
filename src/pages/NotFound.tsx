import { Link, useLocation } from "react-router-dom";
import { Home, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HOME_PATH } from "@/lib/routes";

export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="mx-auto max-w-xl py-16 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <SearchX className="h-8 w-8" />
      </div>

      <p className="mt-6 text-5xl font-extrabold tracking-tight text-slate-900">404</p>
      <h1 className="mt-2 text-xl font-bold text-slate-900">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Alamat <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{pathname}</code> tidak
        tersedia atau sudah dipindahkan.
      </p>

      <div className="mt-6 flex justify-center">
        <Link to={HOME_PATH}>
          <Button className="rounded-full bg-indigo-600 text-white hover:bg-indigo-700">
            <Home className="mr-1.5 h-4 w-4" />
            Kembali ke Beranda
          </Button>
        </Link>
      </div>
    </div>
  );
}
