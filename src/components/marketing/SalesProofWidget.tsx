import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { marketingApi, type SalesProofEntry } from "@/lib/api";

export default function SalesProofWidget() {
  const [entries, setEntries] = useState<SalesProofEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void marketingApi.salesProof()
      .then((response) => {
        if (!cancelled) setEntries(response.data.entries ?? []);
      })
      .catch(() => {
        // Widget non-kritis: jika endpoint gagal atau belum ada transaksi nyata,
        // jangan mengganti dengan data fiktif.
        if (!cancelled) setEntries([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (entries.length === 0) return;

    let cycleTimeoutId: number | undefined;
    let swapTimeoutId: number | undefined;
    const runCycle = () => {
      setIsVisible(true);
      cycleTimeoutId = window.setTimeout(() => {
        setIsVisible(false);
        swapTimeoutId = window.setTimeout(() => {
          setActiveIndex((current) => (current + 1) % entries.length);
          runCycle();
        }, 3000);
      }, 5000);
    };

    runCycle();
    return () => {
      if (cycleTimeoutId) window.clearTimeout(cycleTimeoutId);
      if (swapTimeoutId) window.clearTimeout(swapTimeoutId);
    };
  }, [entries]);

  if (entries.length === 0) return null;
  const activeEntry = entries[activeIndex % entries.length];
  const initial = activeEntry.display_name.trim().charAt(0).toUpperCase();

  return (
    <div
      className={`fixed bottom-3 left-3 z-40 w-[min(19rem,calc(100%-1.5rem))] transition-all duration-500 ease-out sm:bottom-4 sm:left-4 sm:w-[min(26rem,calc(100%-2rem))] ${
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-4 pointer-events-none opacity-0"
      }`}
      aria-live="polite"
    >
      <div className="overflow-hidden rounded-[1.35rem] border border-indigo-100 bg-white/95 p-3 shadow-xl shadow-indigo-200/50 backdrop-blur sm:rounded-3xl sm:p-4 sm:shadow-2xl sm:shadow-indigo-200/60">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-indigo-200 sm:h-11 sm:w-11 sm:rounded-2xl sm:text-base">
            {initial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2 sm:gap-3">
              <div className="truncate text-base font-bold leading-tight text-slate-900 sm:text-lg">
                {activeEntry.display_name}
              </div>
              <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 sm:px-2.5 sm:py-1 sm:text-[11px]">
                <BadgeCheck className="h-3 w-3" /> Terverifikasi
              </div>
            </div>

            <div className="mt-1.5 text-sm font-semibold leading-snug text-slate-600 sm:mt-2 sm:text-base">
              membeli <span className="text-indigo-600">{activeEntry.purchase_label}</span>
            </div>
            <div className="mt-1 text-xs text-slate-400 sm:text-sm">
              {relativeTime(activeEntry.paid_at)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Pembayaran terverifikasi";
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}
