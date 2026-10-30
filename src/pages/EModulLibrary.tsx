import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, BookOpen, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emodulApi, type EModulListItem } from "@/lib/emodulApi";
import { EMODUL_NEW_PATH, EMODUL_PATH } from "@/lib/routes";

/**
 * Pustaka E-Modul — daftar modul milik guru dari database.
 *
 * Dibaca langsung lewat RLS (hanya baris milik sendiri). Kartu membuka editor;
 * keadaan kosong & galat ditampilkan eksplisit supaya guru tahu apa yang terjadi.
 */
export default function EModulLibrary() {
  const [items, setItems] = useState<EModulListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const list = await emodulApi.list();
        if (active) {
          setItems(list);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Gagal memuat pustaka e-modul.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pustaka E-Modul</h1>
          <p className="text-sm text-slate-500">Semua e-modul dan bahan ajar yang pernah Anda susun.</p>
        </div>
        <Link to={EMODUL_NEW_PATH}>
          <Button className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700">
            <Plus className="mr-1.5 h-4 w-4" />
            Buat E-Modul
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Memuat e-modul...
        </div>
      )}

      {!isLoading && error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <BookOpen className="h-6 w-6" />
          </div>
          <h2 className="mt-3 font-bold text-slate-900">Belum ada e-modul</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mulai dari generator: isi topik &amp; capaian, pilih jenjang, lalu AI menyusunnya.
          </p>
          <Link to={EMODUL_NEW_PATH}>
            <Button className="mt-4 rounded-full bg-emerald-600 text-white hover:bg-emerald-700">
              <Plus className="mr-1.5 h-4 w-4" />
              Buat E-Modul Pertama
            </Button>
          </Link>
        </div>
      )}

      {!isLoading && !error && items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`${EMODUL_PATH}/${item.id}`}
                className="group flex h-full flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                      item.status === "ready"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                        : "bg-amber-50 text-amber-700 ring-amber-100"
                    }`}
                  >
                    {item.status === "ready" ? "Siap" : "Draf"}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="line-clamp-2 font-bold text-slate-900">{item.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.subject} · {item.fase} {item.kelas} · Semester {item.semester}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.chaptersTarget} bab × {item.subChaptersTarget} subbab · {formatDate(item.updatedAt)}
                  </p>
                </div>

                <span className="inline-flex items-center text-sm font-semibold text-emerald-700">
                  Buka editor
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !error && items.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Daftar dibatasi 50 modul terbaru.
        </p>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
