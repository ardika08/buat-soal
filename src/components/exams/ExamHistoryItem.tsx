import { Clock, Eye, FileText, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { ExamSession } from "@/lib/api";

interface ExamHistoryItemProps {
  exam: ExamSession;
  onDelete: (exam: ExamSession) => void;
}

export default function ExamHistoryItem({ exam, onDelete }: ExamHistoryItemProps) {
  const navigate = useNavigate();

  const formatDate = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const dateText = date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timeText = date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${dateText}, ${timeText} WIB`;
  };

  return (
    <div className="group bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-all hover:border-indigo-200 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-4 text-left"
        onClick={() => navigate(`/review?exam=${exam.id}`)}
      >
        <div className="mt-1 bg-indigo-50 p-2.5 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
          <FileText className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 text-lg group-hover:text-indigo-700 transition-colors">
            {exam.subject}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5 flex flex-wrap gap-2 items-center">
            <span>{exam.class_phase}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>{exam.exam_type}</span>
          </p>
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 text-sm text-slate-500 pl-14 sm:pl-0">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Clock className="w-4 h-4" />
          {formatDate(exam.created_at)}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:border-indigo-200"
            onClick={() => navigate(`/review?exam=${exam.id}`)}
            title="Lihat hasil"
          >
            <Eye className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Lihat Hasil</span>
          </Button>
          <Button
            variant="destructive"
            size="icon-sm"
            onClick={() => onDelete(exam)}
            title="Hapus riwayat soal"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
