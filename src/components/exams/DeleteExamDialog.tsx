import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExamSession } from "@/lib/api";

interface DeleteExamDialogProps {
  exam: ExamSession | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteExamDialog({ exam, isDeleting, onCancel, onConfirm }: DeleteExamDialogProps) {
  return (
    <Dialog open={Boolean(exam)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden" showCloseButton={!isDeleting}>
        <div className="p-6">
          <DialogHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">Hapus Riwayat Soal?</DialogTitle>
            <DialogDescription className="text-slate-600">
              Riwayat soal <span className="font-semibold text-slate-900">"{exam?.subject}"</span> akan dihapus permanen beserta daftar soalnya.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            Tindakan ini tidak bisa dikembalikan.
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t bg-slate-50 px-6 py-5 sm:flex-row sm:justify-end sm:px-7">
          <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
            Batal
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting} className="bg-red-600 text-white hover:bg-red-700">
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isDeleting ? "Menghapus..." : "Hapus"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
