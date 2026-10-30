import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import { AuthProvider } from "./lib/auth";
import { EMODUL_ACCESS_PATH, EMODUL_NEW_PATH, EMODUL_PATH, EMODUL_PREVIEW_PATH, HOME_PATH, LOGIN_PATH, PLANS_PATH, PROFILE_PATH } from "./lib/routes";
import { isSupabaseConfigured } from "./lib/supabase";
import Dashboard from "./pages/Dashboard";
import BillingReturn from "./pages/BillingReturn";
import EModulEditor from "./pages/EModulEditor";
import EModulGenerator from "./pages/EModulGenerator";
import EModulLibrary from "./pages/EModulLibrary";
import EModulPreview from "./pages/EModulPreview";
import EbookAccess from "./pages/EbookAccess";
import SubscriptionPlans from "./pages/SubscriptionPlans";
import ExamHistory from "./pages/ExamHistory";
import GenerateExam from "./pages/GenerateExam";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import ReviewExam from "./pages/ReviewExam";
import QuestionBank from "./pages/QuestionBank";
import TransactionHistory from "./pages/TransactionHistory";

function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-2xl rounded-3xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">Konfigurasi Supabase Belum Lengkap</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Aplikasi local tidak bisa dijalankan karena environment frontend belum berisi kredensial Supabase.
            Isi file <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env</code> dengan nilai berikut lalu restart Vite.
          </p>
          <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-sm text-slate-100">
            <pre className="whitespace-pre-wrap">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_CLIENT_ID=your-google-client-id`}
            </pre>
          </div>
          <p className="mt-4 text-sm text-slate-600">
            Saat ini file <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env</code> Anda baru berisi Google Client ID dan API base URL, jadi browser berhenti di layar putih sebelum React selesai render.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path={LOGIN_PATH} element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to={HOME_PATH} replace />} />
              <Route path={HOME_PATH} element={<Dashboard />} />
              <Route path="/history" element={<ExamHistory />} />
              <Route path="/question-bank" element={<QuestionBank />} />
              <Route path="/transactions" element={<TransactionHistory />} />
              <Route path={PROFILE_PATH} element={<Profile />} />
              <Route path="generate" element={<GenerateExam />} />
              <Route path="review" element={<ReviewExam />} />
              <Route path="billing/return" element={<BillingReturn />} />
              <Route path={EMODUL_PATH} element={<EModulLibrary />} />
              <Route path={EMODUL_NEW_PATH} element={<EModulGenerator />} />
              <Route path={EMODUL_ACCESS_PATH} element={<EbookAccess />} />
              <Route path={PLANS_PATH} element={<SubscriptionPlans />} />
              <Route path={EMODUL_PREVIEW_PATH} element={<EModulPreview />} />
              <Route path={`${EMODUL_PATH}/:id`} element={<EModulEditor />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
