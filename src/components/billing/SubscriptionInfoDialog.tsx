import { useEffect, useState } from "react";
import { Crown, LifeBuoy, MessageSquareMore, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SubscriptionInfoDialogProps {
  onAcknowledge: () => void;
  countdownSeconds?: number;
}

export default function SubscriptionInfoDialog({
  onAcknowledge,
  countdownSeconds = 15,
}: SubscriptionInfoDialogProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(countdownSeconds);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [countdownSeconds]);

  const canClose = remainingSeconds === 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && canClose) {
      onAcknowledge();
    }
  };

  return (
    <Dialog open onOpenChange={handleOpenChange} disablePointerDismissal>
      <DialogContent
        className="max-w-[calc(100%-1.5rem)] overflow-hidden border-none bg-white p-0 shadow-2xl sm:max-w-2xl"
        showCloseButton={canClose}
      >
        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-5 text-white sm:px-8">
          <div className="mb-4 inline-flex rounded-2xl bg-white/15 p-3 ring-1 ring-white/20 backdrop-blur-sm">
            <Crown className="h-6 w-6" />
          </div>
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-2xl font-bold text-white">
              Mengapa Soalify Berlangganan?
            </DialogTitle>
            <DialogDescription className="max-w-xl text-sm leading-relaxed text-indigo-100">
              Kami membangun Soalify agar tetap berkualitas, stabil, dan terus berkembang untuk membantu pekerjaan guru setiap hari.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-8">
          <div className="grid gap-3">
            <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <p className="text-sm leading-6 text-slate-700">
                Soalify menggunakan <span className="font-semibold text-slate-900">model AI tier premium</span> agar hasil soal lebih konsisten, relevan, dan efisien untuk kebutuhan pembelajaran.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <p className="text-sm leading-6 text-slate-700">
                Biaya langganan juga membantu kami menyediakan <span className="font-semibold text-slate-900">support dan maintenance</span> jika ada kendala teknis atau kebutuhan bantuan saat menggunakan tools ini.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <Crown className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm leading-6 text-slate-700">
                Ini berbeda dengan penjual lain yang menerapkan skema <span className="font-semibold text-slate-900">sekali bayar lalu beli putus</span>, yang umumnya tidak menyediakan dukungan lanjutan setelah pembelian.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-fuchsia-100 bg-fuchsia-50/70 p-4">
              <MessageSquareMore className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-600" />
              <p className="text-sm leading-6 text-slate-700">
                Anda juga bisa <span className="font-semibold text-slate-900">request update fitur</span>, dan kami akan mempertimbangkannya jika memungkinkan untuk dikembangkan.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            Kami ingin layanan ini terus stabil, berkembang, dan benar-benar membantu pekerjaan Anda.
          </div>
        </div>

        <DialogFooter className="items-center justify-between gap-3 border-slate-200 bg-white px-6 py-4 sm:flex-row sm:px-8">
          <p className="text-xs text-slate-500">
            {canClose ? "Informasi sudah bisa ditutup." : `Mohon baca sebentar. Tombol aktif dalam ${remainingSeconds} detik.`}
          </p>
          <Button
            className="min-w-36 bg-indigo-600 text-white hover:bg-indigo-700"
            disabled={!canClose}
            onClick={onAcknowledge}
          >
            {canClose ? "Saya Mengerti" : `Tutup (${remainingSeconds} dtk)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
