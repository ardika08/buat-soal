import { BookOpen, FileDown, Lock, RefreshCw, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EbookUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Membuka penawaran paket langganan (mis. BillingDialog tab langganan). */
  onViewPackages: () => void;
}

const BENEFITS = [
  { icon: BookOpen, text: "Buka seluruh e-modul & bahan ajar" },
  { icon: FileDown, text: "Unduh PDF & DOCX tanpa batas" },
  { icon: School, text: "Kop identitas sekolah pada dokumen" },
  { icon: RefreshCw, text: "Pembaruan struktur & konten modul" },
];

/**
 * Ajakan upgrade E-Book untuk pengguna tanpa langganan.
 *
 * Menjelaskan manfaat E-Book yang dibundel ke paket Premium, lalu mengarahkan
 * ke penawaran paket (tanpa sistem pembayaran terpisah).
 */
export default function EbookUpgradeDialog({
  open,
  onOpenChange,
  onViewPackages,
}: EbookUpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <Lock className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-lg">Buka Akses E-Book</DialogTitle>
          <DialogDescription className="text-center">
            E-book dan e-modul dibundel ke paket Premium — tanpa sistem pembayaran
            terpisah.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {BENEFITS.map((benefit) => (
            <li
              key={benefit.text}
              className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <benefit.icon className="h-4 w-4" />
              </div>
              <span className="text-sm leading-6 text-slate-700">{benefit.text}</span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Nanti saja
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={onViewPackages}
          >
            Lihat Paket Premium
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
