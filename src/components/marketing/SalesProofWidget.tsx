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

      const visibleDuration = 3000 + Math.floor(Math.random() * 2001);

      cycleTimeoutId = window.setTimeout(() => {
        setIsVisible(false);

        swapTimeoutId = window.setTimeout(() => {
          setActiveIndex((current) => (current + 1) % SALES_PROOF_ENTRIES.length);
          runCycle();
        }, 450);
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
      className={`fixed bottom-4 left-4 z-40 w-[min(26rem,calc(100%-2rem))] transition-all duration-500 ease-out ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "-translate-y-4 opacity-0"
      }`}
    >
      <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-white/95 p-4 shadow-2xl shadow-indigo-200/60 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-base font-bold text-white shadow-lg shadow-indigo-200">
            {initial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pr-2">
                <div className="text-lg font-bold leading-none text-slate-900">
                  {activeEntry.teacherName}
                  <span className="ml-1.5 whitespace-nowrap text-sm font-medium text-slate-500">
                    dari {activeEntry.city}
                  </span>
                </div>
              </div>

              <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
                <Circle className="h-2.5 w-2.5 fill-current stroke-current" />
                Live
              </div>
            </div>

            <div className="mt-2 text-base font-semibold leading-snug text-slate-600">
              baru saja membeli{" "}
              <span className="text-indigo-600">{activeEntry.packageName}</span>
            </div>

            <div className="mt-1 text-sm text-slate-400">
              {activeEntry.minutesAgo} menit lalu
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
