import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BillingDialog from "@/components/billing/BillingDialog";
import DeleteExamDialog from "@/components/exams/DeleteExamDialog";
import ExamHistoryItem from "@/components/exams/ExamHistoryItem";
import { useAuth } from "@/lib/auth";
import { examsApi, type ExamSession } from "@/lib/api";

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [recentExams, setRecentExams] = useState<ExamSession[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingTab, setBillingTab] = useState<"topup" | "subscription">("topup");
  const [deleteTarget, setDeleteTarget] = useState<ExamSession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    void refreshUser();
    examsApi.list()
      .then((res) => {
        const exams = res.data.data ?? [];
        setRecentExams(exams.slice(0, 3));
        setTotalQuestions(res.data.total_questions ?? exams.reduce((sum, exam) => sum + (exam.questions_count ?? 0), 0));
      })
      .catch(() => {
        setRecentExams([]);
        setTotalQuestions(0);
      });
  }, [refreshUser]);

  const openBilling = (tab: "topup" | "subscription") => {
    setBillingTab(tab);
    setBillingOpen(true);
  };

  const confirmDeleteExam = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);

    try {
      await examsApi.delete(deleteTarget.id);
      setRecentExams((current) => current.filter((item) => item.id !== deleteTarget.id));
      setTotalQuestions((current) => Math.max(0, current - (deleteTarget.questions_count ?? deleteTarget.questions?.length ?? 0)));
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hero / Quick Action */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-xl shadow-indigo-200">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="relative z-10 px-8 py-12 md:py-16 md:px-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl text-center md:text-left space-y-4">
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
              Buat Soal Ujian <br /> dalam Hitungan Menit.
            </h1>
            <p className="text-indigo-100 text-lg md:text-xl leading-relaxed">
              Otomatiskan pembuatan soal berbasis Taksonomi Bloom secara cerdas. Hemat waktu Anda untuk hal yang lebih penting.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
              <Link to="/generate">
                <Button size="lg" className="bg-white text-indigo-700 hover:bg-slate-50 font-bold px-8 rounded-full h-14 shadow-lg shadow-indigo-900/20 group">
                  <Zap className="w-5 h-5 mr-2 group-hover:text-amber-500 transition-colors" />
                  Mulai Buat Soal
                </Button>
              </Link>
              <span className="text-sm text-indigo-200">Butuh 1 Kredit per soal.</span>
            </div>
          </div>
          
          <div className="hidden lg:flex w-64 h-64 bg-white/10 rounded-full items-center justify-center backdrop-blur-sm border border-white/20 relative">
            <div className="absolute w-48 h-48 bg-gradient-to-tr from-white/20 to-white/5 rounded-full animate-pulse"></div>
            <FileText className="w-24 h-24 text-white drop-shadow-md z-10" />
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-md shadow-slate-200/50 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Soal Dibuat</CardTitle>
            <FileText className="w-4 h-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{totalQuestions}</div>
            <p className="text-xs text-slate-500 mt-1">Dari riwayat tersimpan</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md shadow-slate-200/50 hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Sisa Kredit</CardTitle>
            <Zap className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{user?.credits_balance ?? 0}</div>
            <button
              className="text-xs text-amber-600 mt-1 flex items-center gap-1 cursor-pointer hover:underline"
              onClick={() => openBilling("topup")}
            >
              Top up kredit
            </button>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md shadow-slate-200/50 hover:shadow-lg transition-shadow bg-gradient-to-br from-indigo-50 to-purple-50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-indigo-700">Paket Aktif</CardTitle>
            <div className="px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-800 text-[10px] font-bold uppercase tracking-wider">{user?.subscription_tier ?? "free"}</div>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-slate-900">
              {user?.subscription_tier === "premium" ? "Premium Aktif" : "Gratis Selamanya"}
            </div>
            <button
              className="text-xs text-indigo-600 mt-1 cursor-pointer hover:underline"
              onClick={() => openBilling("subscription")}
            >
              {user?.subscription_tier === "premium" ? "Perpanjang Premium" : "Upgrade ke Premium"}
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Recent History */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Riwayat Terakhir</h2>
          <Link to="/history">
            <Button variant="ghost" className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50">
              Lihat Semua <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
        
        <div className="grid gap-4">
          {recentExams.length === 0 && (
            <div className="bg-white border rounded-xl p-6 text-center text-slate-500">
              Belum ada riwayat soal. Mulai buat soal pertama Anda.
            </div>
          )}

          {recentExams.map((exam) => (
            <ExamHistoryItem key={exam.id} exam={exam} onDelete={setDeleteTarget} />
          ))}
        </div>
      </div>

      <BillingDialog
        open={billingOpen}
        onOpenChange={(open) => {
          setBillingOpen(open);
          if (!open) {
            void refreshUser();
          }
        }}
        defaultTab={billingTab}
      />
      <DeleteExamDialog
        exam={deleteTarget}
        isDeleting={isDeleting}
        onCancel={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteExam()}
      />
    </div>
  );
}
