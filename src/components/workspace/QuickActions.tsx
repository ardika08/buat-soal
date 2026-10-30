import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EMODUL_NEW_PATH } from "@/lib/routes";

/**
 * Aksi cepat beranda: memulai soal baru atau e-modul baru.
 *
 * Pintasan e-modul membuka wizard Generator E-Modul.
 */
export default function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link to="/generate">
        <Button size="lg" className="h-11 rounded-full bg-indigo-600 px-5 font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700">
          <Plus className="mr-2 h-4 w-4" />
          Buat Soal Baru
        </Button>
      </Link>
      <Link to={EMODUL_NEW_PATH}>
        <Button
          size="lg"
          variant="outline"
          className="h-11 rounded-full border-emerald-200 bg-emerald-50 px-5 font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          <Plus className="mr-2 h-4 w-4" />
          Buat E-Modul Baru
        </Button>
      </Link>
    </div>
  );
}
