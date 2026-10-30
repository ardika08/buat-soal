import { useEffect, useState } from "react";
import BillingDialog from "@/components/billing/BillingDialog";
import SubscriptionInfoDialog from "@/components/billing/SubscriptionInfoDialog";
import ContinueWorkPanel from "@/components/workspace/ContinueWorkPanel";
import CreditPackageSummary from "@/components/workspace/CreditPackageSummary";
import QuickActions from "@/components/workspace/QuickActions";
import TwoFlowPanel from "@/components/workspace/TwoFlowPanel";
import { useAuth } from "@/lib/auth-context";
import { examsApi, type ExamSession } from "@/lib/api";
import { emodulApi, type EModulListItem } from "@/lib/emodulApi";
import { markSubscriptionInfoSeen, shouldShowSubscriptionInfo } from "@/lib/session-flags";

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const [recentExams, setRecentExams] = useState<ExamSession[]>([]);
  const [lastEModul, setLastEModul] = useState<EModulListItem | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingTab, setBillingTab] = useState<"topup" | "subscription">("topup");
  const [subscriptionInfoDismissed, setSubscriptionInfoDismissed] = useState(false);
  const subscriptionInfoOpen = Boolean(user) && !subscriptionInfoDismissed && shouldShowSubscriptionInfo();

  useEffect(() => {
    void refreshUser();
    examsApi.list()
      .then((res) => {
        const exams = res.data.data ?? [];
        setRecentExams(exams);
        setTotalQuestions(res.data.total_questions ?? exams.reduce((sum, exam) => sum + (exam.questions_count ?? 0), 0));
      })
      .catch(() => {
        setRecentExams([]);
        setTotalQuestions(0);
      });
    emodulApi.list(1)
      .then((items) => setLastEModul(items[0] ?? null))
      .catch(() => setLastEModul(null));
  }, [refreshUser]);

  const openBilling = (tab: "topup" | "subscription") => {
    setBillingTab(tab);
    setBillingOpen(true);
  };

  const lastExam = recentExams[0];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Sapaan & Aksi Cepat */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-500">Ruang kerja guru</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Selamat datang{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-sm text-slate-500">Kelola alur Soal dan E-book dari satu beranda.</p>
        </div>

        <QuickActions />
      </div>

      {/* Dua Aliran Pekerjaan */}
      <TwoFlowPanel />

      {/* Ringkasan Kredit & Paket */}
      <CreditPackageSummary
        creditsBalance={user?.credits_balance ?? 0}
        subscriptionTier={user?.subscription_tier ?? "free"}
        hasPurchasedCredits={Boolean(user?.has_purchased_credits)}
        totalQuestions={totalQuestions}
        onTopUp={() => openBilling("topup")}
        onUpgrade={() => openBilling("subscription")}
      />

      {/* Lanjutkan Pekerjaan Terakhir */}
      <ContinueWorkPanel examDraft={lastExam} eModulDraft={lastEModul} />

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
      {subscriptionInfoOpen && (
        <SubscriptionInfoDialog
          onAcknowledge={() => {
            markSubscriptionInfoSeen();
            setSubscriptionInfoDismissed(true);
          }}
        />
      )}
    </div>
  );
}
