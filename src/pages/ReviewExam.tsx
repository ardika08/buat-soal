import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Download, CheckCircle2, ArrowLeft, PenLine, FileDown, Zap, ChevronDown, ChevronUp, Save, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { examsApi, type ExamSession, type Question } from "@/lib/api";
import { exportExamDocx, exportExamPdf } from "@/lib/exportExam";

interface ReviewState {
  examId: number;
  exam: ExamSession;
  questions: Question[];
  creditsRemaining: number;
}

export default function ReviewExam() {
  const location = useLocation();
  const state = location.state as ReviewState | null;
  const examIdFromQuery = new URLSearchParams(location.search).get("exam");
  const [loadedState, setLoadedState] = useState<ReviewState | null>(state);
  const [isLoading, setIsLoading] = useState(!state && Boolean(examIdFromQuery));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftQuestions, setDraftQuestions] = useState<Question[]>(state?.questions ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(Boolean(state));

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set([1]));

  useEffect(() => {
    if (state || !examIdFromQuery) {
      return;
    }

    setIsLoading(true);
    examsApi.get(Number(examIdFromQuery))
      .then((res) => {
        setLoadedState({
          examId: Number(examIdFromQuery),
          exam: res.data.exam,
          questions: res.data.questions,
          creditsRemaining: 0,
        });
        setDraftQuestions(res.data.questions);
      })
      .catch(() => setLoadError("Gagal memuat data soal dari server."))
      .finally(() => setIsLoading(false));
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
    setDraftQuestions((current) =>
      current.map((question) => question.id === questionId ? { ...question, ...patch } : question),
    );
  };

  const updateDraftOption = (questionId: number, key: string, value: string) => {
    setDraftQuestions((current) =>
      current.map((question) => question.id === questionId
        ? { ...question, options: { ...(question.options ?? {}), [key]: value } }
        : question,
      ),
    );
  };

  const startEditMode = () => {
    if (!loadedState) return;
    setDraftQuestions(loadedState.questions);
    setExpandedIds(new Set(loadedState.questions.map((question) => question.order_number)));
    setSaveMessage(null);
    setIsEditMode(true);
  };

  const cancelEditMode = () => {
    setDraftQuestions(loadedState?.questions ?? []);
    setSaveMessage(null);
    setIsEditMode(false);
  };

  const saveEdits = async () => {
    if (!loadedState) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const savedQuestions = await Promise.all(
        draftQuestions.map((question) =>
          examsApi.updateQuestion(loadedState.examId, question.id, {
            question_type: question.question_type,
            cognitive_level: question.cognitive_level,
            difficulty: question.difficulty,
            question_content: question.question_content,
            options: question.options,
            correct_answer: question.correct_answer,
            illustration_prompt: question.illustration_prompt,
            illustration_image: question.illustration_image,
          }).then((res) => res.data.question),
        ),
      );

      const sortedQuestions = savedQuestions.sort((a, b) => a.order_number - b.order_number);
      setLoadedState({ ...loadedState, questions: sortedQuestions });
      setDraftQuestions(sortedQuestions);
      setIsEditMode(false);
      setSaveMessage("Perubahan soal berhasil disimpan.");
    } catch {
      setSaveMessage("Gagal menyimpan perubahan. Periksa backend lalu coba lagi.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto rounded-xl border bg-white p-6 text-center text-slate-500">
        Memuat data soal...
      </div>
    );
  }

  // Fallback: if accessed directly without state or query id, show placeholder
  if (!loadedState) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-semibold">{loadError ?? "Tidak ada data soal."}</p>
          <p className="text-amber-600 text-sm mt-1">Silakan buat soal terlebih dahulu dari halaman Generate.</p>
          <Link to="/generate">
            <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white">Buat Soal Baru</Button>
          </Link>
        </div>
      </div>
    );
  }

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
                Soal berhasil dibuat oleh AI. AI dapat membantu jauh lebih efektif, tetapi hasilnya tetap perlu dicek oleh guru.
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

          {visibleQuestions.map((q) => {
            const isOpen = expandedIds.has(q.order_number);
            return (
              <div
                key={q.id}
                className={`bg-white border rounded-xl overflow-hidden transition-shadow ${isOpen ? "shadow-md border-indigo-200" : "shadow-sm"}`}
              >
                {/* Header */}
                <button
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(q.order_number)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center shrink-0">
                      {q.order_number}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isEditMode ? (
                        <Input
                          value={q.question_content.split("\n")[0]}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => updateDraftQuestion(q.id, { question_content: event.target.value })}
                          className="h-8 bg-white"
                        />
                      ) : (
                        <p className="font-medium text-slate-800 text-sm line-clamp-1">
                          {q.question_content.split("\n")[0]}
                        </p>
                      )}
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
                            <Input value={q.question_type} onChange={(event) => updateDraftQuestion(q.id, { question_type: event.target.value })} className="mt-1 bg-white" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500">Level</label>
                            <Input value={q.cognitive_level} onChange={(event) => updateDraftQuestion(q.id, { cognitive_level: event.target.value })} className="mt-1 bg-white" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500">Kesulitan</label>
                            <Input value={q.difficulty} onChange={(event) => updateDraftQuestion(q.id, { difficulty: event.target.value })} className="mt-1 bg-white" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{q.question_content}</p>
                    )}

                    {/* Options */}
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
                            <span className={`font-bold w-5 shrink-0 ${key === q.correct_answer ? "text-emerald-700" : "text-slate-400"}`}>{key}.</span>
                            {isEditMode ? (
                              <Input
                                value={val}
                                onChange={(event) => updateDraftOption(q.id, key, event.target.value)}
                                className="h-8 bg-white"
                              />
                            ) : (
                              <span>{val}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Answer (for non-MC) */}
                    {isEditMode ? (
                      <div className="grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <label className="text-xs font-semibold text-emerald-700">Kunci Jawaban</label>
                        <Textarea
                          value={q.correct_answer}
                          onChange={(event) => updateDraftQuestion(q.id, { correct_answer: event.target.value })}
                          className="bg-white"
                          rows={2}
                        />
                      </div>
                    ) : !q.options && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <p className="text-xs text-emerald-600 font-semibold mb-1">Kunci Jawaban</p>
                        <p className="text-sm text-emerald-800 whitespace-pre-wrap">{q.correct_answer}</p>
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
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar Export */}
        <div className="w-full md:w-72 space-y-4 shrink-0">
          <div className="bg-white border shadow-sm rounded-2xl p-5 sticky top-6">
            <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Ekspor Dokumen</h3>

            <div className="space-y-3">
              <Button onClick={() => void exportExamPdf(exam, visibleQuestions)} className="w-full justify-start bg-slate-100 text-slate-800 hover:bg-slate-200">
                <FileDown className="w-4 h-4 mr-2" /> Simpan sebagai .PDF
              </Button>

              <Button onClick={() => void exportExamDocx(exam, visibleQuestions)} className="w-full justify-start bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100">
                <Download className="w-4 h-4 mr-2" /> Ekspor .DOCX (Word)
              </Button>
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
    </div>
  );
}
