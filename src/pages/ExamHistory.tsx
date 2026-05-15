import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import DeleteExamDialog from "@/components/exams/DeleteExamDialog";
import ExamHistoryItem from "@/components/exams/ExamHistoryItem";
import { Button } from "@/components/ui/button";
import { examsApi, type ExamSession, type PaginatedExams } from "@/lib/api";

export default function ExamHistory() {
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<PaginatedExams | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ExamSession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async (targetPage = page) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await examsApi.list(targetPage);
      setHistory(res.data);
      setPage(res.data.current_page);
    } catch {
      setError("Gagal memuat riwayat soal.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory(page);
  }, [page]);

  const confirmDeleteExam = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);

    try {
      await examsApi.delete(deleteTarget.id);
      setDeleteTarget(null);

      const currentItemCount = history?.data.length ?? 0;
      const nextPage = currentItemCount <= 1 && page > 1 ? page - 1 : page;
      await loadHistory(nextPage);
    } finally {
      setIsDeleting(false);
    }
  };

  const exams = history?.data ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/">
            <Button variant="ghost" className="mb-2 text-slate-500 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Kembali ke Dashboard
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Riwayat Soal</h1>
          <p className="text-sm text-slate-500">
            Kelola semua soal yang pernah dibuat. Hapus riwayat yang sudah tidak diperlukan.
          </p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <span className="font-semibold text-slate-900">{history?.total ?? 0}</span> sesi tersimpan
          <span className="mx-2 text-slate-300">|</span>
          <span className="font-semibold text-slate-900">{history?.total_questions ?? 0}</span> soal
        </div>
      </div>

      {isLoading && (
        <div className="rounded-xl border bg-white p-6 text-center text-slate-500">Memuat riwayat soal...</div>
      )}

      {!isLoading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">{error}</div>
      )}

      {!isLoading && !error && exams.length === 0 && (
        <div className="rounded-xl border bg-white p-8 text-center text-slate-500">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <FileText className="h-6 w-6" />
          </div>
          Belum ada riwayat soal.
        </div>
      )}

      {!isLoading && !error && exams.length > 0 && (
        <div className="grid gap-4">
          {exams.map((exam) => (
            <ExamHistoryItem key={exam.id} exam={exam} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      {history && history.last_page > 1 && (
        <div className="flex items-center justify-between rounded-xl border bg-white p-3 shadow-sm">
          <Button
            variant="outline"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Sebelumnya
          </Button>
          <span className="text-sm font-medium text-slate-600">
            Halaman {history.current_page} dari {history.last_page}
          </span>
          <Button
            variant="outline"
            disabled={page >= history.last_page || isLoading}
            onClick={() => setPage((current) => Math.min(history.last_page, current + 1))}
          >
            Berikutnya
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      <DeleteExamDialog
        exam={deleteTarget}
        isDeleting={isDeleting}
        onCancel={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteExam()}
      />
    </div>
  );
}
