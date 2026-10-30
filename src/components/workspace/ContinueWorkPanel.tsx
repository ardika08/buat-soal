import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, ChevronRight, Clock, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExamSession } from "@/lib/api";
import type { EModulListItem } from "@/lib/emodulApi";
import { EMODUL_NEW_PATH, EMODUL_PATH } from "@/lib/routes";

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface ContinueWorkPanelProps {
  examDraft?: ExamSession | null;
  eModulDraft?: EModulListItem | null;
}

/**
 * Panel "Lanjutkan Pekerjaan Terakhir" pada beranda.
 *
 * Menampilkan draf soal dan draf e-modul terakhir — keduanya dari database
 * (bukan data tiruan). Keduanya opsional dan punya empty state sendiri.
 */
export default function ContinueWorkPanel({ examDraft, eModulDraft }: ContinueWorkPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Lanjutkan Pekerjaan Terakhir</h2>
        <Link to="/history">
          <Button variant="ghost" className="text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800">
            Semua riwayat
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Draf Soal Terakhir */}
        <Card className="border-none shadow-md shadow-slate-200/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Draf Soal Terakhir</CardTitle>
            <FileText className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            {examDraft ? (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-slate-900">{examDraft.subject}</p>
                  <p className="text-xs text-slate-500">
                    {examDraft.class_phase} · {examDraft.exam_type}
                  </p>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  Dibuat {formatDate(examDraft.created_at)}
                </p>
                <Link to={`/review?exam=${examDraft.id}`}>
                  <Button variant="outline" className="w-full rounded-full border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                    Lanjutkan menyunting
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3 py-4 text-center">
                <p className="text-sm text-slate-500">Belum ada draf soal.</p>
                <Link to="/generate">
                  <Button variant="outline" className="rounded-full border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Mulai buat soal
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Draf E-Modul Terakhir */}
        <Card className="border-none shadow-md shadow-slate-200/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Draf E-Modul Terakhir</CardTitle>
            <BookOpen className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {eModulDraft ? (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-slate-900">{eModulDraft.title}</p>
                  <p className="text-xs text-slate-500">
                    {eModulDraft.subject} · {eModulDraft.fase} {eModulDraft.kelas}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {eModulDraft.chaptersTarget} bab × {eModulDraft.subChaptersTarget} subbab
                    </span>
                    <span
                      className={`font-semibold ${
                        eModulDraft.status === "ready" ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {eModulDraft.status === "ready" ? "Siap" : "Draf"}
                    </span>
                  </div>
                </div>

                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  Diperbarui {formatDate(eModulDraft.updatedAt)}
                </p>

                <Link to={`${EMODUL_PATH}/${eModulDraft.id}`}>
                  <Button variant="outline" className="w-full rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                    Lanjutkan menyunting
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3 py-4 text-center">
                <p className="text-sm text-slate-500">Belum ada draf e-modul.</p>
                  <Link to={EMODUL_NEW_PATH}>
                  <Button variant="outline" className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Mulai buat e-modul
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
