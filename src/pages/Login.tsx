import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BrainCircuit, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BASE_URL } from "@/lib/api";
import { HOME_PATH } from "@/lib/routes";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: { theme: string; size: string; text: string; shape: string; width: number }
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function Login() {
  const buttonRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // Konfigurasi kurang adalah kondisi statis, bukan kejadian: diturunkan saat render
  // supaya tidak memicu render berantai lewat setState di dalam effect.
  const configError = GOOGLE_CLIENT_ID
    ? null
    : "Layanan login Google belum dikonfigurasi. Hubungi administrator atau periksa pengaturan aplikasi.";

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }

    const renderGoogleButton = () => {
      if (!window.google || !buttonRef.current) {
        return;
      }

      buttonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          if (!response.credential) {
            setError("Akun Google tidak mengirim data login. Pilih kembali akun Google Anda lalu coba lagi.");
            return;
          }

          try {
            setError(null);
            await loginWithGoogle(response.credential);
            navigate(HOME_PATH, { replace: true });
          } catch (err: unknown) {
            const apiError = err as {
              response?: {
                status?: number;
                data?: { message?: string; errors?: Record<string, string[]> };
              };
              request?: unknown;
              message?: string;
            };
            const validation = apiError.response?.data?.errors
              ? Object.values(apiError.response.data.errors).flat()[0]
              : undefined;
            const fallback = apiError.request && !apiError.response
              ? `Tidak dapat terhubung ke server (${BASE_URL}). Periksa koneksi internet Anda lalu coba lagi.`
              : apiError.message;
            setError(
              validation ??
                apiError.response?.data?.message ??
                fallback ??
                "Gagal masuk dengan Google. Periksa koneksi internet Anda lalu coba lagi.",
            );
          }
        },
      });

      const availableWidth = buttonRef.current.clientWidth || 320;
      const buttonWidth = Math.max(200, Math.min(320, availableWidth));

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: buttonWidth,
      });
    };

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    script.onerror = () =>
      setError("Tombol login Google gagal dimuat. Periksa koneksi internet Anda lalu muat ulang halaman.");
    document.body.appendChild(script);
  }, [loginWithGoogle, navigate]);

  if (user) {
    return <Navigate to={HOME_PATH} replace />;
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center space-y-3 mb-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-200">
            <BrainCircuit className="h-8 w-8 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Masuk ke Soalify</h1>
            <p className="mt-2 text-sm text-slate-600">
              Masuk atau daftar otomatis memakai akun Google. Pengguna baru mendapat 100 kredit gratis.
            </p>
          </div>
        </div>

        {(configError ?? error) && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{configError ?? error}</span>
          </div>
        )}

        <div className="flex w-full justify-center overflow-hidden" ref={buttonRef} />
      </div>
    </main>
  );
}
