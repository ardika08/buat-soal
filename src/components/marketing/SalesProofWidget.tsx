import { useEffect, useState } from "react";
import { BadgeCheck, Pause, Play } from "lucide-react";
import { marketingApi, type SalesProofEntry } from "@/lib/api";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function SalesProofWidget() {
  const [entries, setEntries] = useState<SalesProofEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

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
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const isCycling = !isPaused && !reducedMotion;
  const alwaysVisible = entries.length <= 1 || !isCycling;

  useEffect(() => {
    if (entries.length <= 1 || !isCycling) {
      return;
    }

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
  }, [entries, isCycling]);

  if (entries.length === 0) return null;
  const activeEntry = entries[activeIndex % entries.length];
  const initial = activeEntry.display_name.trim().charAt(0).toUpperCase();
  const shown = alwaysVisible || isVisible;

  return (
    <div
      className={`fixed bottom-3 left-3 z-40 w-[min(19rem,calc(100%-1.5rem))] transition-[transform,opacity] duration-500 ease-out motion-reduce:transition-none sm:bottom-4 sm:left-4 sm:w-[min(26rem,calc(100%-2rem))] ${
        shown ? "translate-y-0 opacity-100" : "-translate-y-4 pointer-events-none opacity-0"
      }`}
      aria-live="polite"
    >
      <div className="relative overflow-hidden rounded-[1.35rem] border border-indigo-100 bg-white/95 p-3 shadow-xl shadow-indigo-200/50 backdrop-blur sm:rounded-3xl sm:p-4 sm:shadow-2xl sm:shadow-indigo-200/60">
        <div className="flex items-start gap-2.5 pr-8 sm:gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-indigo-200 sm:h-11 sm:w-11 sm:rounded-2xl sm:text-base">
            {initial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
              <div className="break-words text-base font-bold leading-tight text-slate-900 sm:text-lg">
                {activeEntry.display_name}
              </div>
              <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 sm:px-2.5 sm:py-1 sm:text-[11px]">
                <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Terverifikasi
              </div>
            </div>

            <div className="mt-1.5 text-sm font-semibold leading-snug text-slate-700 sm:mt-2 sm:text-base">
              membeli <span className="text-indigo-700">{activeEntry.purchase_label}</span>
            </div>
            <div className="mt-1 text-xs text-slate-600 sm:text-sm">
              {relativeTime(activeEntry.paid_at)}
            </div>
          </div>
        </div>

        {entries.length > 1 && (
          <button
            type="button"
            onClick={() => setIsPaused((current) => !current)}
            aria-label={isPaused ? "Lanjutkan putaran bukti pembelian" : "Jeda putaran bukti pembelian"}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <span className="grid place-items-center">
              <span
                className={`[grid-area:1/1] transition-[opacity,filter,transform] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] motion-reduce:scale-100 motion-reduce:blur-[0px] ${
                  isPaused ? "scale-100 opacity-100 blur-[0px]" : "scale-[0.25] opacity-0 blur-[4px]"
                }`}
              >
                <Play className="h-3 w-3 translate-x-px" aria-hidden="true" />
              </span>
              <span
                className={`[grid-area:1/1] transition-[opacity,filter,transform] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] motion-reduce:scale-100 motion-reduce:blur-[0px] ${
                  isPaused ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-[0px]"
                }`}
              >
                <Pause className="h-3 w-3" aria-hidden="true" />
              </span>
            </span>
          </button>
        )}
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
