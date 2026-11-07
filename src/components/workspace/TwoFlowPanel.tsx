import { Link } from "react-router-dom";
import { ArrowRight, BookMarked, BookOpen, FileText, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EMODUL_NEW_PATH, EMODUL_PATH } from "@/lib/routes";

/**
 * Panel dua aliran pekerjaan guru: alur Soal dan alur E-book.
 *
 * Kedua aliran ditampilkan berdampingan sebagai pintu masuk utama beranda.
 * Alur E-book menuju wizard generator e-modul dan pustaka materinya.
 */
export default function TwoFlowPanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Alur Soal */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/60 p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-indigo-100/60" aria-hidden="true" />
        <div className="relative z-10 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-200">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Alur Soal</h2>
              <p className="text-sm text-slate-500">Naskah ujian &amp; bank soal</p>
            </div>
          </div>

          <p className="text-sm leading-6 text-slate-600">
            Susun naskah ujian lengkap dengan pemetaan Taksonomi Bloom, sunting butir, lalu ekspor PDF/DOCX.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link to="/generate">
              <Button className="rounded-full bg-indigo-600 text-white hover:bg-indigo-700">
                Mulai Buat Soal
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/question-bank">
              <Button variant="ghost" className="rounded-full text-indigo-700 hover:bg-indigo-50">
                <Library className="mr-1.5 h-4 w-4" />
                Bank Soal
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Alur E-book */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/60 p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-100/60" aria-hidden="true" />
        <div className="relative z-10 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Alur E-book</h2>
              <p className="text-sm text-slate-500">E-modul &amp; bahan ajar</p>
            </div>
          </div>

          <p className="text-sm leading-6 text-slate-600">
            Biarkan AI menyusun e-modul terstruktur (bab, subbab, latihan), lalu sunting dan unduh materinya.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link to={EMODUL_NEW_PATH}>
              <Button className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700">
                Mulai E-Modul
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Link to={EMODUL_PATH}>
              <Button variant="ghost" className="rounded-full text-emerald-700 hover:bg-emerald-50">
                <BookMarked className="mr-1.5 h-4 w-4" />
                Pustaka Materi
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
