import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export default function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">
        Memuat sesi...
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
