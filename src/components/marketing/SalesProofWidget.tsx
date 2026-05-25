import { useEffect, useState } from "react";
import { Circle } from "lucide-react";

const SALES_PROOF_ENTRIES = [
  { teacherName: "Rina Kartika", city: "Bandung", packageName: "Premium 12 Bulan", minutesAgo: 12 },
  { teacherName: "Andi Saputra", city: "Surabaya", packageName: "Top Up 100 Soal", minutesAgo: 18 },
  { teacherName: "Diah Puspita", city: "Yogyakarta", packageName: "Premium 6 Bulan", minutesAgo: 24 },
  { teacherName: "Fajar Nugroho", city: "Semarang", packageName: "Top Up 50 Soal", minutesAgo: 31 },
  { teacherName: "Siska Wulandari", city: "Makassar", packageName: "Premium 12 Bulan", minutesAgo: 37 },
];

export default function SalesProofWidget() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let cycleTimeoutId: number | undefined;
    let swapTimeoutId: number | undefined;

    const runCycle = () => {
      setIsVisible(true);

      const visibleDuration = 4000;
      const hiddenPauseDuration = 3000;

      cycleTimeoutId = window.setTimeout(() => {
        setIsVisible(false);

        swapTimeoutId = window.setTimeout(() => {
          setActiveIndex((current) => (current + 1) % SALES_PROOF_ENTRIES.length);
          runCycle();
        }, hiddenPauseDuration);
      }, visibleDuration);
    };

    runCycle();

    return () => {
      if (cycleTimeoutId) {
        window.clearTimeout(cycleTimeoutId);
      }

      if (swapTimeoutId) {
        window.clearTimeout(swapTimeoutId);
      }
    };
  }, []);

  const activeEntry = SALES_PROOF_ENTRIES[activeIndex];
  const initial = activeEntry.teacherName.trim().charAt(0).toUpperCase();

  return (
    <div
      className={`fixed bottom-3 left-3 z-40 w-[min(19rem,calc(100%-1.5rem))] sm:bottom-4 sm:left-4 sm:w-[min(26rem,calc(100%-2rem))] transition-all duration-500 ease-out ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "-translate-y-4 opacity-0"
      }`}
    >
      <div className="overflow-hidden rounded-[1.35rem] border border-indigo-100 bg-white/95 p-3 shadow-xl shadow-indigo-200/50 backdrop-blur sm:rounded-3xl sm:p-4 sm:shadow-2xl sm:shadow-indigo-200/60">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-indigo-200 sm:h-11 sm:w-11 sm:rounded-2xl sm:text-base">
            {initial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2 sm:gap-3">
              <div className="min-w-0 pr-2">
                <div className="text-base font-bold leading-tight text-slate-900 sm:text-lg sm:leading-none">
                  {activeEntry.teacherName}
                  <span className="ml-1 whitespace-nowrap text-xs font-medium text-slate-500 sm:ml-1.5 sm:text-sm">
                    dari {activeEntry.city}
                  </span>
                </div>
              </div>

              <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 sm:px-2.5 sm:py-1 sm:text-[11px]">
                <Circle className="h-2 w-2 fill-current stroke-current sm:h-2.5 sm:w-2.5" />
                Live
              </div>
            </div>

            <div className="mt-1.5 text-sm font-semibold leading-snug text-slate-600 sm:mt-2 sm:text-base">
              baru saja membeli{" "}
              <span className="text-indigo-600">{activeEntry.packageName}</span>
            </div>

            <div className="mt-1 text-xs text-slate-400 sm:text-sm">
              {activeEntry.minutesAgo} menit lalu
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
