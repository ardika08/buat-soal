import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, CheckSquare, Combine, FilePlus2, Search, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { examsApi, questionBankApi, type BankQuestion, type ExamSession } from "@/lib/api";

export default function QuestionBank() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [exams, setExams] = useState<ExamSession[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [classPhase, setClassPhase] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [appendOpen, setAppendOpen] = useState(false);
  const [packageName, setPackageName] = useState("Paket dari Bank Soal");
  const [targetExam, setTargetExam] = useState("");

  useEffect(() => {
    Promise.all([questionBankApi.list(), examsApi.list(1, 100)])
      .then(([bankResponse, examResponse]) => {
        setQuestions(bankResponse.data.questions);
        setExams(examResponse.data.data ?? []);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Gagal memuat bank soal.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const values = (key: "subject" | "class_phase" | "topic" | "difficulty") =>
    [...new Set(questions.map((question) => question[key]).filter(Boolean) as string[])].sort();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions.filter((question) =>
      (!query || question.question_content.toLowerCase().includes(query))
      && (!subject || question.subject === subject)
      && (!classPhase || question.class_phase === classPhase)
      && (!topic || question.topic === topic)
      && (!difficulty || question.difficulty === difficulty),
    );
  }, [questions, search, subject, classPhase, topic, difficulty]);

  const toggle = (id: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleVisible = () => setSelected((current) => {
    const allSelected = filtered.length > 0 && filtered.every((item) => current.has(item.id));
    const next = new Set(current);
    filtered.forEach((item) => allSelected ? next.delete(item.id) : next.add(item.id));
    return next;
  });

  const remove = async (id: number) => {
    setBusy(`delete-${id}`);
    setMessage(null);
    try {
      await questionBankApi.delete(id);
      setQuestions((current) => current.filter((question) => question.id !== id));
      setSelected((current) => { const next = new Set(current); next.delete(id); return next; });
      setMessage("Soal dihapus dari bank.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menghapus soal.");
    } finally {
      setBusy(null);
    }
  };

  const createPackage = async () => {
    if (selected.size === 0) return;
    setBusy("create");
    setMessage(null);
    try {
      const response = await questionBankApi.createExam([...selected], packageName);
      setCreateOpen(false);
      navigate(`/review?exam=${response.data.exam_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal membuat paket soal.");
    } finally {
      setBusy(null);
    }
  };

  const appendPackage = async () => {
    const examId = Number(targetExam);
    if (selected.size === 0 || !examId) return;
    setBusy("append");
    setMessage(null);
    try {
      const response = await questionBankApi.appendToExam(examId, [...selected]);
      setAppendOpen(false);
      setMessage(`${response.data.added} soal ditambahkan; ${response.data.duplicates} duplikat dilewati.`);
      if (response.data.added > 0) navigate(`/review?exam=${examId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menggabungkan soal.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-indigo-600"><BookOpen className="h-5 w-5" /><span className="text-sm font-semibold">Koleksi Pribadi</span></div>
          <h1 className="text-2xl font-bold text-slate-900">Bank Soal</h1>
          <p className="mt-1 text-sm text-slate-500">Gunakan kembali soal lama tanpa biaya kredit AI.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={selected.size === 0} onClick={() => setAppendOpen(true)}><Combine className="mr-2 h-4 w-4" />Gabungkan ke Riwayat</Button>
          <Button disabled={selected.size === 0} onClick={() => setCreateOpen(true)} className="bg-indigo-600 text-white hover:bg-indigo-700"><FilePlus2 className="mr-2 h-4 w-4" />Buat Paket ({selected.size})</Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-5">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari pertanyaan..." className="pl-9" /></div>
        <FilterSelect value={subject} onChange={setSubject} label="Semua mapel" options={values("subject")} />
        <FilterSelect value={classPhase} onChange={setClassPhase} label="Semua kelas/fase" options={values("class_phase")} />
        <FilterSelect value={topic} onChange={setTopic} label="Semua topik" options={values("topic")} />
        <FilterSelect value={difficulty} onChange={setDifficulty} label="Semua kesulitan" options={values("difficulty")} />
      </div>

      {message && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.toLowerCase().includes("gagal") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message}</div>}

      <div className="flex items-center justify-between">
        <button type="button" onClick={toggleVisible} disabled={filtered.length === 0} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-700 disabled:opacity-40">
          {filtered.length > 0 && filtered.every((item) => selected.has(item.id)) ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4" />}
          Pilih semua yang tampil
        </button>
        <span className="text-sm text-slate-500">{filtered.length} dari {questions.length} soal</span>
      </div>

      {isLoading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-slate-500">Memuat bank soal...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-500">Belum ada soal yang cocok. Simpan soal dari halaman Review.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((question) => (
            <article key={question.id} className={`rounded-2xl border bg-white p-5 shadow-sm transition ${selected.has(question.id) ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"}`}>
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => toggle(question.id)} className="mt-0.5 text-indigo-600" aria-label="Pilih soal">
                  {selected.has(question.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-slate-400" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap gap-1.5 text-[11px] font-medium">
                    <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{question.subject}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{question.class_phase}</span>
                    {question.topic && <span className="rounded-full bg-cyan-50 px-2 py-1 text-cyan-700">{question.topic}</span>}
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{question.difficulty || "—"}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-slate-800">{question.question_content}</p>
                  {question.options && <div className="mt-3 grid gap-1 text-xs text-slate-600">{Object.entries(question.options).map(([key, value]) => <span key={key}><b>{key}.</b> {value}</span>)}</div>}
                  <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><b>Kunci:</b> {question.correct_answer}</div>
                </div>
                <button type="button" disabled={busy === `delete-${question.id}`} onClick={() => void remove(question.id)} title="Hapus dari bank" className="text-slate-400 hover:text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buat paket soal baru</DialogTitle><DialogDescription>{selected.size} soal terpilih akan disalin ke riwayat tanpa memotong kredit.</DialogDescription></DialogHeader>
          <Input value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="Nama paket soal" />
          <DialogFooter><Button variant="ghost" onClick={() => setCreateOpen(false)}>Batal</Button><Button disabled={busy === "create" || !packageName.trim()} onClick={() => void createPackage()}>{busy === "create" ? "Membuat..." : "Buat Paket"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={appendOpen} onOpenChange={setAppendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gabungkan ke riwayat</DialogTitle><DialogDescription>Pilih paket hasil AI atau riwayat lama. Soal identik otomatis dilewati.</DialogDescription></DialogHeader>
          <select value={targetExam} onChange={(e) => setTargetExam(e.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Pilih riwayat tujuan...</option>
            {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.subject} — {exam.class_phase} — {exam.exam_type}</option>)}
          </select>
          <DialogFooter><Button variant="ghost" onClick={() => setAppendOpen(false)}>Batal</Button><Button disabled={busy === "append" || !targetExam} onClick={() => void appendPackage()}>{busy === "append" ? "Menggabungkan..." : "Gabungkan"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: string[] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">{label}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}
