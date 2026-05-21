import { useEffect, useState, type ReactNode } from "react";
import { Circle, FileText, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface AppStats {
  live: boolean;
  total_users: number;
  total_questions: number;
}

const INITIAL_STATS: AppStats = {
  live: true,
  total_users: 0,
  total_questions: 0,
};

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

function StatItem({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 ring-1 ring-indigo-100">
        {icon}
      </div>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">{value}</span>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      </div>
    </div>
  );
}

export default function AppStatsBar() {
  const [stats, setStats] = useState<AppStats>(INITIAL_STATS);

  useEffect(() => {
    let isActive = true;
    let retryTimeoutId: number | undefined;
    let refreshIntervalId: number | undefined;

    const loadStats = () => {
      if (!supabase) {
        setStats(INITIAL_STATS);
        return;
      }

      (supabase.functions.invoke("app-stats", { body: {} }) as Promise<{ data: AppStats | null; error: Error | null }>)
        .then(({ data, error }: { data: AppStats | null; error: Error | null }) => {
          if (!isActive) {
            return;
          }

          if (error || !data) {
            throw error ?? new Error("Statistik aplikasi belum tersedia.");
          }

          setStats(data as AppStats);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }

          setStats(INITIAL_STATS);
          retryTimeoutId = window.setTimeout(loadStats, 10000);
        });
    };

    loadStats();
    refreshIntervalId = window.setInterval(loadStats, 60000);

    return () => {
      isActive = false;

      if (retryTimeoutId) {
        window.clearTimeout(retryTimeoutId);
      }

      if (refreshIntervalId) {
        window.clearInterval(refreshIntervalId);
      }
    };
  }, []);

  return (
    <div className="sticky top-16 z-40 border-b border-slate-200/80 bg-white/88 shadow-sm backdrop-blur-md">
      <div className="container mx-auto flex min-h-14 items-center overflow-x-auto px-4">
        <div className="flex min-w-max items-center gap-4 text-sm sm:gap-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-100">
            <Circle className="h-2.5 w-2.5 fill-current stroke-current" />
            <span className="text-xs font-bold uppercase tracking-[0.22em]">
              {stats.live ? "Live" : "Offline"}
            </span>
          </div>

          <div className="h-6 w-px bg-slate-200" />

          <StatItem
            icon={<Users className="h-4 w-4" />}
            value={formatCompactNumber(stats.total_users)}
            label="User"
          />

          <div className="h-6 w-px bg-slate-200" />

          <StatItem
            icon={<FileText className="h-4 w-4" />}
            value={formatCompactNumber(stats.total_questions)}
            label="Soal"
          />
        </div>
      </div>
    </div>
  );
}
