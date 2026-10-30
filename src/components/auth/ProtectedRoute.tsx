import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { LOGIN_PATH } from "@/lib/routes";

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">
        Memuat sesi...
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to={LOGIN_PATH} replace />;
}
