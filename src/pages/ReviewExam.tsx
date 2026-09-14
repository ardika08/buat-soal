import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Download, CheckCircle2, ArrowLeft, PenLine, FileDown, Zap, ChevronDown, ChevronUp, Save, X, AlertTriangle, FileText, Lock, Plus, Trash2, ArrowUp, ArrowDown, Copy, Sparkles, BookOpen, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import BillingDialog from "@/components/billing/BillingDialog";
import { examsApi, questionBankApi, type ExamSession, type Question } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { exportExamDocx, exportExamPdf } from "@/lib/exportExam";
import { exportKisiKisiDocx } from "@/lib/exportKisiKisi";

interface ReviewState {
  examId: number;
  exam: ExamSession;
  questions: Question[];
  creditsRemaining: number;
}

// Nilai enum dropdown: menjaga konsistensi supaya "Sulit", "sulit", salah ketik
// tidak tersimpan sebagai nilai berbeda yang mengacaukan kisi-kisi dan filter.
const QUESTION_TYPES = ["Pilihan Ganda", "Pilihan Ganda Kompleks", "Benar/Salah", "Isian Singkat", "Uraian", "Menjodohkan"];
const COGNITIVE_LEVELS = ["C1", "C2", "C3", "C4", "C5", "C6"];
const DIFFICULTY_LEVELS = ["Mudah", "Sedang", "Sulit"];
const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];

/** Perbandingan dangkal field yang bisa diedit, dipakai untuk mendeteksi perubahan nyata. */
function questionsEqual(a: Question, b: Question) {
  return a.question_type === b.question_type
    && a.cognitive_level === b.cognitive_level
    && a.difficulty === b.difficulty
    && a.question_content === b.question_content
    && a.correct_answer === b.correct_answer
    && (a.explanation ?? "") === (b.explanation ?? "")
    && (a.illustration_prompt ?? "") === (b.illustration_prompt ?? "")
    && (a.illustration_image ?? "") === (b.illustration_image ?? "")
    && JSON.stringify(a.options ?? null) === JSON.stringify(b.options ?? null);
}

/** Kunci opsi berikutnya yang belum terpakai (A, B, C, ...). */
function nextOptionKey(options: Record<string, string> | null): string | null {
  const used = new Set(Object.keys(options ?? {}));
  return OPTION_KEYS.find((key) => !used.has(key)) ?? null;
}

export default function ReviewExam() {
  const location = useLocation();
  const { user, refreshUser } = useAuth();
  const state = location.state as ReviewState | null;
  const examIdFromQuery = new URLSearchParams(location.search).get("exam");
  // Satu state untuk siklus muat: tidak perlu menyalakan loading di dalam effect,
  // dan `loadError` tidak bisa lagi bertabrakan dengan `loadedState`.
  const [loadState, setLoadState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: ReviewState }
    | { kind: "error"; message: string }
  >(() => {
    if (state) {
      return { kind: "ready", data: state };
    }
    if (examIdFromQuery) {
      return { kind: "loading" };
    }
    return { kind: "error", message: "Tidak ada data soal." };
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftQuestions, setDraftQuestions] = useState<Question[]>(state?.questions ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(Boolean(state));

  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    new Set(state?.questions[0] ? [state.questions[0].id] : []),
  );
  const [isExportingKisi, setIsExportingKisi] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  // Aksi struktural (tambah/hapus/urut/regenerasi) langsung ke server, tidak lewat
  // draft — supaya id soal baru dan nomor urut selalu konsisten dengan database.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState<Question | null>(null);
  const [regenTarget, setRegenTarget] = useState<Question | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [bankSelection, setBankSelection] = useState<Set<number>>(new Set());
  const [isSavingToBank, setIsSavingToBank] = useState(false);
  const autoSaveRef = useRef<() => Promise<void>>(async () => undefined);

  /**
   * Ekspor .docx adalah fitur berlangganan (lihat PRD). Konsisten dengan logika
   * `expire_subscriptions` di database: premium tanpa tanggal kedaluwarsa berlaku
   * selamanya; premium dengan tanggal yang sudah lewat dianggap free.
   */
  const isPremiumActive = Boolean(
    user
      && user.subscription_tier === "premium"
      && (!user.subscription_expiry || new Date(user.subscription_expiry) > new Date()),
  );

  useEffect(() => {
    if (state || !examIdFromQuery) {
      return;
    }

    examsApi.get(Number(examIdFromQuery))
      .then((res) => {
        setLoadState({
          kind: "ready",
          data: {
            examId: Number(examIdFromQuery),
            exam: res.data.exam,
            questions: res.data.questions,
            creditsRemaining: 0,
          },
        });
        setDraftQuestions(res.data.questions);
        if (res.data.questions[0]) setExpandedIds(new Set([res.data.questions[0].id]));
      })
      .catch(() => setLoadState({ kind: "error", message: "Gagal memuat data soal dari server." }));
  }, [examIdFromQuery, state]);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateDraftQuestion = (questionId: number, patch: Partial<Question>) => {
    setSaveMessage("Belum disimpan...");
    setDraftQuestions((current) =>
      current.map((question) => question.id === questionId ? { ...question, ...patch } : question),
    );
  };

  const updateDraftOption = (questionId: number, key: string, value: string) => {
    setSaveMessage("Belum disimpan...");
    setDraftQuestions((current) =>
      current.map((question) => question.id === questionId
        ? { ...question, options: { ...(question.options ?? {}), [key]: value } }
        : question,
      ),
    );
  };

  const addDraftOption = (questionId: number) => {
    setSaveMessage("Belum disimpan...");
    setDraftQuestions((current) =>
      current.map((question) => {
        if (question.id !== questionId) return question;
        const key = nextOptionKey(question.options);
        if (!key) return question;
        return { ...question, options: { ...(question.options ?? {}), [key]: "" } };
      }),
    );
  };

  const removeDraftOption = (questionId: number, key: string) => {
    setSaveMessage("Belum disimpan...");
    setDraftQuestions((current) =>
      current.map((question) => {
        if (question.id !== questionId || !question.options) return question;
        const next = { ...question.options };
        delete next[key];
        // Bila kunci jawaban menunjuk opsi yang dihapus, kosongkan agar tidak menggantung.
        const correct = question.correct_answer === key ? "" : question.correct_answer;
        return { ...question, options: next, correct_answer: correct };
      }),
    );
  };

  const startEditMode = () => {
    if (loadState.kind !== "ready") return;
    setDraftQuestions(loadState.data.questions);
    setExpandedIds(new Set(loadState.data.questions.map((question) => question.id)));
    setSaveMessage(null);
    setIsEditMode(true);
  };

  const cancelEditMode = () => {
    setDraftQuestions(loadState.kind === "ready" ? loadState.data.questions : []);
    setSaveMessage(null);
    setIsEditMode(false);
  };

  /**
   * Menyimpan hanya soal yang benar-benar berubah, satu per satu (bukan Promise.all).
   *
   * Sebelumnya semua soal dikirim paralel: satu kegagalan di tengah membuat sebagian
   * tersimpan sebagian tidak, sementara pesannya cuma "gagal menyimpan" tanpa tahu mana
   * yang gagal. Sekarang urut + fail-fast, dan nomor soal yang gagal disebut eksplisit.
   */
  const saveEdits = async (exitEditMode = true) => {
    if (loadState.kind !== "ready") return;
    const loadedState = loadState.data;

    const changedQuestions = draftQuestions.filter((draft) => {
      const original = loadedState.questions.find((question) => question.id === draft.id);
      return original ? !questionsEqual(original, draft) : false;
    });

    if (changedQuestions.length === 0) {
      if (exitEditMode) {
        setIsEditMode(false);
        setSaveMessage("Tidak ada perubahan untuk disimpan.");
      }
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    const saved: Question[] = [];
    try {
      for (const question of changedQuestions) {
        const res = await examsApi.updateQuestion(loadedState.examId, question.id, {
          question_type: question.question_type,
          cognitive_level: question.cognitive_level,
          difficulty: question.difficulty,
          question_content: question.question_content,
          options: question.options,
          correct_answer: question.correct_answer,
          explanation: question.explanation,
          illustration_prompt: question.illustration_prompt,
          illustration_image: question.illustration_image,
        });
        saved.push(res.data.question);
      }

      const merged = loadedState.questions
        .map((question) => saved.find((item) => item.id === question.id) ?? question)
        .sort((a, b) => a.order_number - b.order_number);

      setLoadState({ kind: "ready", data: { ...loadedState, questions: merged } });
      setDraftQuestions(merged);
      if (exitEditMode) setIsEditMode(false);
      setSaveMessage(exitEditMode
        ? `Perubahan ${saved.length} soal berhasil disimpan.`
        : `Tersimpan otomatis (${saved.length} soal).`);
    } catch (error) {
      const failed = changedQuestions[saved.length];
      setSaveMessage(
        saved.length > 0
          ? `Gagal menyimpan soal nomor ${failed?.order_number ?? "-"}. ${saved.length} soal sebelumnya sudah tersimpan — ulangi simpan untuk melanjutkan.`
          : "Gagal menyimpan perubahan. Periksa koneksi Supabase lalu coba lagi.",
      );
      console.error("[ReviewExam] saveEdits", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Ref menghindari timer dibuat ulang hanya karena identitas fungsi berubah tiap render.
  useEffect(() => {
    autoSaveRef.current = () => saveEdits(false);
  });

  useEffect(() => {
    if (!isEditMode || isSaving || loadState.kind !== "ready") return;
    const hasChanges = draftQuestions.some((draft) => {
      const original = loadState.data.questions.find((item) => item.id === draft.id);
      return original ? !questionsEqual(original, draft) : false;
    });
    if (!hasChanges) return;

    const timer = window.setTimeout(() => {
      void autoSaveRef.current();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [draftQuestions, isEditMode, isSaving, loadState]);

  // Peringatkan user jika meninggalkan tab saat masih ada draft belum tersimpan.
  useEffect(() => {
    if (!isEditMode || loadState.kind !== "ready") return;
    const hasChanges = draftQuestions.some((draft) => {
      const original = loadState.data.questions.find((item) => item.id === draft.id);
      return original ? !questionsEqual(original, draft) : false;
    });
    if (!hasChanges) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftQuestions, isEditMode, loadState]);

  // --- Aksi struktural: langsung sinkron ke server, lalu perbarui state lokal ---

  /** Mengganti seluruh daftar soal di state (ready + draft) setelah aksi server. */
  const applyServerQuestions = (questions: Question[]) => {
    if (loadState.kind !== "ready") return;
    const sorted = [...questions].sort((a, b) => a.order_number - b.order_number);
    setLoadState({ kind: "ready", data: { ...loadState.data, questions: sorted } });
    setDraftQuestions(sorted);
    const validIds = new Set(sorted.map((question) => question.id));
    setBankSelection((current) => new Set([...current].filter((id) => validIds.has(id))));
  };

  const handleAddQuestion = async (afterOrder: number | null, template?: Question) => {
    if (loadState.kind !== "ready" || busyAction) return;
    setBusyAction("add");
    setSaveMessage(null);
    try {
      const res = await examsApi.addQuestion(loadState.data.examId, afterOrder, {
        question_type: template?.question_type ?? "Pilihan Ganda",
        cognitive_level: template?.cognitive_level ?? "",
        difficulty: template?.difficulty ?? "Sedang",
        question_content: template?.question_content ?? "Tulis pertanyaan di sini.",
        options: template?.options ?? { A: "Pilihan A", B: "Pilihan B", C: "Pilihan C", D: "Pilihan D" },
        correct_answer: template?.correct_answer ?? "A",
        explanation: template?.explanation ?? "",
      });
      const added = res.data.question;
      // Ambil ulang urutan penuh: nomor soal lain mungkin bergeser oleh RPC.
      const refreshed = await examsApi.get(loadState.data.examId);
      applyServerQuestions(refreshed.data.questions);
      setExpandedIds((prev) => new Set(prev).add(added.id));
      if (!template) setIsEditMode(true);
      setSaveMessage(template ? "Soal berhasil diduplikat." : "Soal baru ditambahkan. Lengkapi isinya; perubahan tersimpan otomatis.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Gagal menambahkan soal.");
      console.error("[ReviewExam] handleAddQuestion", error);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteQuestion = async (question: Question) => {
    if (loadState.kind !== "ready" || busyAction) return;
    setBusyAction("delete");
    setSaveMessage(null);
    try {
      await examsApi.deleteQuestion(loadState.data.examId, question.id);
      const refreshed = await examsApi.get(loadState.data.examId);
      applyServerQuestions(refreshed.data.questions);
      setSaveMessage("Soal berhasil dihapus.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Gagal menghapus soal.");
      console.error("[ReviewExam] handleDeleteQuestion", error);
    } finally {
      setBusyAction(null);
      setDeleteQuestionTarget(null);
    }
  };

  const handleMoveQuestion = async (question: Question, direction: -1 | 1) => {
    if (loadState.kind !== "ready" || busyAction) return;
    const current = [...loadState.data.questions].sort((a, b) => a.order_number - b.order_number);
    const index = current.findIndex((item) => item.id === question.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;

    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setBusyAction("move");
    setSaveMessage(null);
    try {
      const res = await examsApi.reorderQuestions(
        loadState.data.examId,
        reordered.map((item) => item.id),
      );
      applyServerQuestions(res.data.questions);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Gagal mengurutkan soal.");
      console.error("[ReviewExam] handleMoveQuestion", error);
    } finally {
      setBusyAction(null);
    }
  };

  const toggleBankSelection = (questionId: number) => {
    setBankSelection((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId); else next.add(questionId);
      return next;
    });
  };

  const saveSelectedToBank = async () => {
    if (bankSelection.size === 0 || isSavingToBank) return;
    setIsSavingToBank(true);
    setSaveMessage(null);
    try {
      const response = await questionBankApi.saveQuestions([...bankSelection]);
      const { saved, duplicates } = response.data;
      setSaveMessage(`${saved} soal disimpan ke bank${duplicates > 0 ? `; ${duplicates} duplikat dilewati` : ""}.`);
      setBankSelection(new Set());
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Gagal menyimpan ke bank soal.");
    } finally {
      setIsSavingToBank(false);
    }
  };

  const handleRegenerate = async (question: Question, instruction: string) => {
    if (loadState.kind !== "ready" || busyAction) return;
    setBusyAction("regen");
    setSaveMessage(null);
    try {
      const res = await examsApi.regenerateQuestion(question.id, instruction);
      const updated = res.data.question;
      const merged = loadState.data.questions.map((item) =>
        item.id === updated.id ? updated : item,
      );
      applyServerQuestions(merged);
      // Kredit terpotong di server; segarkan saldo yang tampil di header/dashboard.
      await refreshUser().catch(() => undefined);
      setSaveMessage(`Soal nomor ${updated.order_number} dibuat ulang. Sisa kredit: ${res.data.credits_remaining}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membuat ulang soal.";
      setSaveMessage(message.includes("insufficient") || message.includes("cukup")
        ? "Kredit tidak cukup untuk regenerasi (butuh 1 kredit)."
        : message);
      console.error("[ReviewExam] handleRegenerate", error);
    } finally {
      setBusyAction(null);
      setRegenTarget(null);
      setRegenInstruction("");
    }
  };

  if (loadState.kind === "loading") {
    return (
      <div className="max-w-5xl mx-auto rounded-xl border bg-white p-6 text-center text-slate-500">
        Memuat data soal...
      </div>
    );
  }

  // Fallback: if accessed directly without state or query id, show placeholder
  if (loadState.kind === "error") {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-semibold">{loadState.message}</p>
          <p className="text-amber-600 text-sm mt-1">Silakan buat soal terlebih dahulu dari halaman Generate.</p>
          <Link to="/generate">
            <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white">Buat Soal Baru</Button>
          </Link>
        </div>
      </div>
    );
  }

  const loadedState = loadState.data;
  const { exam, questions, creditsRemaining } = loadedState;
  const visibleQuestions = isEditMode ? draftQuestions : questions;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <Dialog
        open={disclaimerOpen}
        onOpenChange={(open) => {
          if (!open) {
            return;
          }

          setDisclaimerOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden" showCloseButton={false}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-3 top-3 text-slate-500 hover:text-slate-900"
            onClick={() => setDisclaimerOpen(false)}
            title="Tutup disclaimer"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="p-6">
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900">Periksa Kembali Soal</DialogTitle>
              <DialogDescription className="text-slate-600">
                Soal berhasil dibuat oleh Sistem. AI dapat membantu jauh lebih efektif, tetapi hasilnya tetap perlu dicek oleh guru.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Silakan periksa kembali soal yang telah dibuat.</p>
              <p className="mt-1">
                Pastikan materi, pilihan jawaban, kunci, level kognitif, dan bahasa soal sudah sesuai sebelum dibagikan kepada siswa.
              </p>
            </div>
          </div>

          <div className="border-t bg-slate-50 px-6 py-4 text-sm text-slate-500">
            Tutup pesan ini dengan tombol X setelah selesai membaca.
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="bg-emerald-100 p-2 rounded-full text-emerald-600 shrink-0 self-start">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-emerald-800">Berhasil Dibuat!</h2>
          <p className="text-emerald-700 text-sm">
            <strong>{visibleQuestions.length} soal</strong> berhasil dibuat untuk <strong>{exam.subject}</strong> — {exam.exam_type}.{" "}
            Kredit terpakai: <strong>{exam.credits_consumed}</strong>.
          </p>
        </div>
        {state && (
          <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-1.5 shrink-0">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-slate-700">Sisa: {creditsRemaining} kredit</span>
          </div>
        )}
      </div>

      {/* Exam Meta */}
      <div className="bg-white border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {[
          { label: "Kurikulum", value: exam.curriculum },
          { label: "Jenis Ujian", value: exam.exam_type },
          { label: "Fase / Kelas", value: exam.class_phase },
          { label: "Waktu", value: `${exam.time_allocation} Menit` },
        ].map(item => (
          <div key={item.label}>
            <p className="text-slate-400 text-xs">{item.label}</p>
            <p className="font-semibold text-slate-800 mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Questions List */}
        <div className="flex-1 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-bold text-slate-800 text-base">
              Daftar Soal ({visibleQuestions.length} butir)
            </h3>
            {saveMessage && (
              <p className={`text-sm ${saveMessage.startsWith("Gagal") ? "text-red-600" : "text-emerald-600"}`}>
                {saveMessage}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <button
              type="button"
              onClick={() => {
                const allSelected = visibleQuestions.length > 0
                  && visibleQuestions.every((question) => bankSelection.has(question.id));
                setBankSelection(allSelected
                  ? new Set()
                  : new Set(visibleQuestions.map((question) => question.id)));
              }}
              disabled={visibleQuestions.length === 0 || isEditMode}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {visibleQuestions.length > 0 && visibleQuestions.every((question) => bankSelection.has(question.id))
                ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                : <Square className="h-4 w-4" />}
              Pilih semua
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/question-bank" className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <BookOpen className="h-4 w-4" />
                Buka Bank Soal
              </Link>
              <Button
                type="button"
                disabled={bankSelection.size === 0 || isSavingToBank || isEditMode}
                onClick={() => void saveSelectedToBank()}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {isSavingToBank ? "Menyimpan..." : `Simpan ke Bank (${bankSelection.size})`}
              </Button>
            </div>
          </div>

          {visibleQuestions.map((q, index) => {
            const isOpen = expandedIds.has(q.id);
            return (
              <div
                key={q.id}
                className={`bg-white border rounded-xl overflow-hidden transition-shadow ${isOpen ? "shadow-md border-indigo-200" : "shadow-sm"}`}
              >
                {/* Header */}
                <div className="flex w-full items-center hover:bg-slate-50 transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleBankSelection(q.id)}
                    disabled={isEditMode}
                    aria-label={`Pilih soal nomor ${q.order_number} untuk bank soal`}
                    className="ml-4 shrink-0 text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {bankSelection.has(q.id)
                      ? <CheckSquare className="h-5 w-5" />
                      : <Square className="h-5 w-5 text-slate-400" />}
                  </button>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between p-4 text-left"
                    onClick={() => toggleExpand(q.id)}
                  >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center shrink-0">
                      {q.order_number}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Header hanya menampilkan pratinjau satu baris. Sebelumnya header ini
                          adalah Input yang nilainya `question_content.split("\n")[0]`, sehingga
                          mengetik satu karakter di sini menimpa seluruh isi soal (termasuk baris
                          opsi/uraian yang sudah benar). Edit isi soal hanya lewat Textarea di
                          panel yang sudah dibuka. */}
                      <p className="font-medium text-slate-800 text-sm line-clamp-1">
                        {q.question_content.split("\n")[0]}
                      </p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{q.question_type}</span>
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{q.cognitive_level}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          q.difficulty === "Sulit" ? "bg-red-50 text-red-700" :
                          q.difficulty === "Sedang" ? "bg-amber-50 text-amber-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>{q.difficulty}</span>
                      </div>
                    </div>
                  </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>
                </div>

                {/* Expanded Content */}
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 border-t bg-slate-50 space-y-4">
                    {isEditMode ? (
                      <div className="grid gap-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-500">Pertanyaan</label>
                          <Textarea
                            value={q.question_content}
                            onChange={(event) => updateDraftQuestion(q.id, { question_content: event.target.value })}
                            className="mt-1 bg-white"
                            rows={4}
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="text-xs font-semibold text-slate-500">Jenis</label>
                            <select
                              value={QUESTION_TYPES.includes(q.question_type) ? q.question_type : ""}
                              onChange={(event) => updateDraftQuestion(q.id, { question_type: event.target.value })}
                              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              {!QUESTION_TYPES.includes(q.question_type) && <option value="">{q.question_type || "Pilih jenis"}</option>}
                              {QUESTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500">Level</label>
                            <select
                              value={COGNITIVE_LEVELS.find((level) => q.cognitive_level.toUpperCase().startsWith(level)) ?? ""}
                              onChange={(event) => updateDraftQuestion(q.id, { cognitive_level: event.target.value })}
                              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="">—</option>
                              {COGNITIVE_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500">Kesulitan</label>
                            <select
                              value={DIFFICULTY_LEVELS.includes(q.difficulty) ? q.difficulty : ""}
                              onChange={(event) => updateDraftQuestion(q.id, { difficulty: event.target.value })}
                              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="">—</option>
                              {DIFFICULTY_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{q.question_content}</p>
                    )}

                    {/* Options */}
                    {isEditMode && !q.options && (
                      <button
                        type="button"
                        onClick={() => updateDraftQuestion(q.id, { options: { A: "", B: "", C: "", D: "" }, correct_answer: "A" })}
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        <Plus className="w-3.5 h-3.5" /> Gunakan pilihan jawaban
                      </button>
                    )}
                    {q.options && (
                      <div className="space-y-2">
                        {Object.entries(q.options).map(([key, val]) => (
                          <div
                            key={key}
                            className={`flex items-start gap-3 p-2.5 rounded-lg text-sm ${
                              key === q.correct_answer
                                ? "bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium"
                                : "bg-white border border-slate-200 text-slate-700"
                            }`}
                          >
                            {isEditMode ? (
                              <button
                                type="button"
                                title={key === q.correct_answer ? "Kunci jawaban" : "Tandai sebagai kunci"}
                                onClick={() => updateDraftQuestion(q.id, { correct_answer: key })}
                                className={`font-bold w-6 h-6 shrink-0 rounded-full border text-xs ${key === q.correct_answer ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-300 text-slate-500 hover:border-emerald-400"}`}
                              >
                                {key}
                              </button>
                            ) : (
                              <span className={`font-bold w-5 shrink-0 ${key === q.correct_answer ? "text-emerald-700" : "text-slate-400"}`}>{key}.</span>
                            )}
                            {isEditMode ? (
                              <>
                                <Input
                                  value={val}
                                  onChange={(event) => updateDraftOption(q.id, key, event.target.value)}
                                  className="h-8 bg-white"
                                />
                                <button
                                  type="button"
                                  title="Hapus opsi"
                                  onClick={() => removeDraftOption(q.id, key)}
                                  className="shrink-0 text-slate-400 hover:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <span>{val}</span>
                            )}
                          </div>
                        ))}
                        {isEditMode && nextOptionKey(q.options) && (
                          <button
                            type="button"
                            onClick={() => addDraftOption(q.id)}
                            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            <Plus className="w-3.5 h-3.5" /> Tambah opsi
                          </button>
                        )}
                        {isEditMode && (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] text-slate-400">Klik huruf di kiri opsi untuk menandai kunci jawaban.</p>
                            <button
                              type="button"
                              onClick={() => updateDraftQuestion(q.id, { options: null, correct_answer: "" })}
                              className="text-[11px] font-medium text-red-500 hover:text-red-700"
                            >
                              Hapus semua opsi
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Answer (for non-MC) */}
                    {isEditMode && !q.options ? (
                      <div className="grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <label className="text-xs font-semibold text-emerald-700">Kunci Jawaban</label>
                        <Textarea
                          value={q.correct_answer}
                          onChange={(event) => updateDraftQuestion(q.id, { correct_answer: event.target.value })}
                          className="bg-white"
                          rows={2}
                        />
                      </div>
                    ) : !isEditMode && !q.options && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <p className="text-xs text-emerald-600 font-semibold mb-1">Kunci Jawaban</p>
                        <p className="text-sm text-emerald-800 whitespace-pre-wrap">{q.correct_answer}</p>
                      </div>
                    )}

                    {/* Pembahasan */}
                    {isEditMode ? (
                      <div>
                        <label className="text-xs font-semibold text-slate-500">Pembahasan (opsional)</label>
                        <Textarea
                          value={q.explanation ?? ""}
                          onChange={(event) => updateDraftQuestion(q.id, { explanation: event.target.value || null })}
                          className="mt-1 bg-white"
                          rows={3}
                          placeholder="Jelaskan mengapa jawaban ini benar..."
                        />
                      </div>
                    ) : q.explanation && (
                      <div className="bg-slate-100 border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-500 font-semibold mb-1">Pembahasan</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{q.explanation}</p>
                      </div>
                    )}

                    {isEditMode && (
                      <div>
                        <label className="text-xs font-semibold text-slate-500">Prompt Ilustrasi</label>
                        <Textarea
                          value={q.illustration_prompt ?? ""}
                          onChange={(event) => updateDraftQuestion(q.id, { illustration_prompt: event.target.value || null })}
                          className="mt-1 bg-white"
                          rows={2}
                        />
                      </div>
                    )}

                    {/* Illustration */}
                    {(q.illustration_image || q.illustration_prompt) && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs text-blue-600 font-semibold">Ilustrasi Soal</p>
                        {q.illustration_image && (
                          <img
                            src={q.illustration_image}
                            alt={`Ilustrasi soal ${q.order_number}`}
                            className="max-h-80 w-full rounded-lg border border-blue-100 object-contain bg-white"
                          />
                        )}
                        {q.illustration_prompt && (
                          <p className="text-sm text-blue-800">{q.illustration_prompt}</p>
                        )}
                      </div>
                    )}

                    {/* Toolbar per soal: urut, duplikat, regenerasi, hapus */}
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <button
                        type="button"
                        disabled={Boolean(busyAction) || isEditMode || index === 0}
                        onClick={() => handleMoveQuestion(q, -1)}
                        className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ArrowUp className="w-3.5 h-3.5" /> Naik
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyAction) || isEditMode || index === visibleQuestions.length - 1}
                        onClick={() => handleMoveQuestion(q, 1)}
                        className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ArrowDown className="w-3.5 h-3.5" /> Turun
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyAction) || isEditMode}
                        onClick={() => handleAddQuestion(q.order_number, q)}
                        className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <Copy className="w-3.5 h-3.5" /> Duplikat
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyAction) || isEditMode}
                        onClick={() => { setRegenTarget(q); setRegenInstruction(""); }}
                        className="flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Buat Ulang (1 kredit)
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyAction) || isEditMode || visibleQuestions.length <= 1}
                        onClick={() => setDeleteQuestionTarget(q)}
                        className="ml-auto flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            disabled={Boolean(busyAction) || isEditMode}
            onClick={() => handleAddQuestion(null)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 py-3 text-sm font-medium text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Tambah soal baru
          </button>
        </div>

        {/* Sidebar Export */}
        <div className="w-full md:w-72 space-y-4 shrink-0">
          <div className="bg-white border shadow-sm rounded-2xl p-5 sticky top-6">
            <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Ekspor Dokumen</h3>

            <div className="space-y-3">
              <Button onClick={() => void exportExamPdf(exam, visibleQuestions)} className="w-full justify-start bg-slate-100 text-slate-800 hover:bg-slate-200">
                <FileDown className="w-4 h-4 mr-2" /> Simpan sebagai .PDF
              </Button>

              {isPremiumActive ? (
                <Button onClick={() => void exportExamDocx(exam, visibleQuestions)} className="w-full justify-start bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100">
                  <Download className="w-4 h-4 mr-2" /> Ekspor .DOCX (Word)
                </Button>
              ) : (
                <Button
                  onClick={() => setBillingOpen(true)}
                  className="w-full justify-start bg-indigo-50 border-indigo-100 text-indigo-400 hover:bg-indigo-100"
                  title="Ekspor .docx tersedia untuk pelanggan Premium"
                >
                  <Lock className="w-4 h-4 mr-2" /> Ekspor .DOCX (Premium)
                </Button>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-emerald-100">
              <div className="text-xs text-emerald-600 mb-2 font-medium">Kisi-Kisi</div>
              {isPremiumActive ? (
                <Button
                  onClick={() => {
                    setIsExportingKisi(true);
                    void exportKisiKisiDocx(exam, visibleQuestions).finally(() =>
                      setIsExportingKisi(false),
                    );
                  }}
                  disabled={isExportingKisi}
                  className="w-full justify-start bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100"
                >
                  <FileText className="w-4 h-4 mr-2" /> {isExportingKisi ? "Membuat kisi-kisi..." : "Download Kisi-Kisi (.DOCX)"}
                </Button>
              ) : (
                <Button
                  onClick={() => setBillingOpen(true)}
                  className="w-full justify-start bg-emerald-50 border-emerald-100 text-emerald-400 hover:bg-emerald-100"
                  title="Kisi-kisi .docx tersedia untuk pelanggan Premium"
                >
                  <Lock className="w-4 h-4 mr-2" /> Kisi-Kisi .DOCX (Premium)
                </Button>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <div className="text-xs text-slate-500 mb-2">Perlu menyesuaikan soal?</div>
              {isEditMode ? (
                <div className="space-y-2">
                  <Button onClick={() => void saveEdits()} disabled={isSaving} className="w-full bg-indigo-600 text-white hover:bg-indigo-700">
                    <Save className="w-4 h-4 mr-2" /> {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
                  </Button>
                  <Button variant="outline" onClick={cancelEditMode} disabled={isSaving} className="w-full text-slate-600">
                    <X className="w-4 h-4 mr-2" /> Batal Edit
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={startEditMode} className="w-full text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                  <PenLine className="w-4 h-4 mr-2" /> Edit Soal
                </Button>
              )}
            </div>
          </div>

          <Link to="/">
            <Button variant="ghost" className="w-full text-slate-500 hover:text-slate-800">
              <ArrowLeft className="w-4 h-4 mr-2" /> Kembali ke Dashboard
            </Button>
          </Link>
        </div>
      </div>

      <BillingDialog
        open={billingOpen}
        onOpenChange={setBillingOpen}
        defaultTab="subscription"
      />

      {/* Konfirmasi hapus soal */}
      <Dialog open={Boolean(deleteQuestionTarget)} onOpenChange={(open) => { if (!open) setDeleteQuestionTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus soal ini?</DialogTitle>
            <DialogDescription>
              Soal nomor {deleteQuestionTarget?.order_number} akan dihapus permanen dan nomor soal berikutnya akan disesuaikan. Tindakan ini tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteQuestionTarget(null)} disabled={busyAction === "delete"}>
              Batal
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => { if (deleteQuestionTarget) void handleDeleteQuestion(deleteQuestionTarget); }}
              disabled={busyAction === "delete"}
            >
              {busyAction === "delete" ? "Menghapus..." : "Hapus Soal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerasi soal */}
      <Dialog open={Boolean(regenTarget)} onOpenChange={(open) => { if (!open) { setRegenTarget(null); setRegenInstruction(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat ulang soal nomor {regenTarget?.order_number}?</DialogTitle>
            <DialogDescription>
              AI akan membuat soal pengganti dengan jenis dan topik yang sama. Biaya 1 kredit. Soal lama akan tergantikan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-500">Instruksi tambahan (opsional)</label>
            <Textarea
              value={regenInstruction}
              onChange={(event) => setRegenInstruction(event.target.value)}
              placeholder="Contoh: buat lebih sulit, ganti konteks ke kehidupan sehari-hari..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRegenTarget(null); setRegenInstruction(""); }} disabled={busyAction === "regen"}>
              Batal
            </Button>
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => { if (regenTarget) void handleRegenerate(regenTarget, regenInstruction); }}
              disabled={busyAction === "regen"}
            >
              {busyAction === "regen" ? "Membuat..." : "Buat Ulang (1 kredit)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
