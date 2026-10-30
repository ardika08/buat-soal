import { Link, useLocation } from "react-router-dom";
import { BrainCircuit, LayoutDashboard, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { sidebarGroups } from "@/lib/navigation";
import { HOME_PATH } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Item dianggap aktif bila alamat sama persis atau berada di bawahnya. */
function isPathActive(pathname: string, to: string, match?: string) {
  const target = match ?? to;
  return pathname === target || pathname.startsWith(`${target}/`);
}

function itemClass(active: boolean) {
  return cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-indigo-50 text-indigo-700"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
  );
}

interface WorkspaceSidebarProps {
  /** Kelas tata letak dari pemanggil (lebar, posisi, visibilitas responsif). */
  className?: string;
  /** Dipanggil setelah item menu diklik — dipakai menutup drawer di layar kecil. */
  onNavigate?: () => void;
}

/**
 * Menu samping workspace dengan grup Buat Materi, Pustaka, dan Akun.
 *
 * Komponen ini hanya mengurus isi menu; tata letaknya (menempel di layar lebar
 * atau jadi drawer di layar kecil) diatur pemanggil lewat `className`.
 */
export default function WorkspaceSidebar({ className, onNavigate }: WorkspaceSidebarProps) {
  const { logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <aside className={cn("flex flex-col border-r bg-white", className)}>
      <div className="flex h-16 items-center border-b px-4">
        <Link
          to={HOME_PATH}
          onClick={onNavigate}
          className="flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-200">
            <BrainCircuit className="h-5 w-5 text-white" />
          </div>
          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-lg font-bold text-transparent">
            Soalify
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <Link to={HOME_PATH} onClick={onNavigate} className={itemClass(isPathActive(pathname, HOME_PATH))}>
          <LayoutDashboard className="h-4 w-4" />
          Beranda
        </Link>

        {sidebarGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </p>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.description}
                  onClick={onNavigate}
                  className={itemClass(isPathActive(pathname, item.to, item.activeMatch))}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t p-3">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            void logout();
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-4 w-4" />
          Keluar
        </button>
      </div>
    </aside>
  );
}
