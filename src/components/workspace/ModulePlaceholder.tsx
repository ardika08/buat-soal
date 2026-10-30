import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HOME_PATH } from "@/lib/routes";

interface ModulePlaceholderProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children?: ReactNode;
}

/**
 * Halaman tiruan untuk modul yang belum dibangun.
 *
 * Dipakai agar setiap alamat modul sudah bisa dibuka langsung dan dibagikan
 * sejak awal. Ganti dengan halaman asli saat modulnya dikerjakan.
 */
export default function ModulePlaceholder({ icon: Icon, title, description, children }: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-3xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <Icon className="h-7 w-7" />
        </div>

        <h1 className="mt-4 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
          <Construction className="h-3.5 w-3.5" />
          Halaman ini masih tiruan — segera hadir
        </div>

        {children}

        <div className="mt-6">
          <Link to={HOME_PATH}>
            <Button variant="outline" className="rounded-full">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Kembali ke Beranda
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
