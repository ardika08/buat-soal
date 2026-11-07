import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Layers,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import BillingDialog from "@/components/billing/BillingDialog";
import { useAuth } from "@/lib/auth-context";
import {
  FASE_OPTIONS,
  KELAS_OPTIONS_BY_FASE,
  SEMESTER_OPTIONS,
  SUBJECT_OPTIONS_BY_FASE,
} from "@/lib/curriculum";
import { emodulApi } from "@/lib/emodulApi";
import { ApiError } from "@/lib/invoke";
import { EMODUL_PATH } from "@/lib/routes";

/**
 * Wizard Generator E-Modul AI (3 langkah).
 *
 * "Generate" memanggil Edge Function `emodul-generate`: kredit dipotong atomik
 * di server, AI menyusun struktur, dan guru diarahkan ke editor dengan ID modul
 * nyata. Estimasi biaya di layar memakai aturan yang sama dengan server
 * (1 kredit per subbab).
 */

interface EModulTopic {
  topik: string;
  capaian: string;
}

interface EModulConfig {
  topics: EModulTopic[];
  fase: string;
  kelas: string;
  subject: string;
  manualSubject: string;
  semester: string;
  subChapters: number;
  exerciseShare: number;
}

const INITIAL_CONFIG: EModulConfig = {
  topics: [{ topik: "", capaian: "" }],
  fase: "Fase A",
  kelas: "Kelas 1",
  subject: SUBJECT_OPTIONS_BY_FASE["Fase A"][0],
  manualSubject: "",
  semester: "Ganjil",
  subChapters: 2,
  exerciseShare: 30,
};

/**
 * Estimasi biaya e-modul di klien: 1 kredit per bagian pengembangan.
 * Server menegakkan aturan yang sama; estimasi ini hanya untuk tampilan.
 */
const EMODUL_COST_PER_SUBBAB = 1;

export default function EModulGenerator() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<EModulConfig>(INITIAL_CONFIG);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [billingOpen, setBillingOpen] = useState(false);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((current) => (current >= 92 ? current : Math.min(92, current + 3)));
    }, 700);

    return () => window.clearInterval(interval);
  }, [isGenerating]);

  const update = <K extends keyof EModulConfig>(key: K, value: EModulConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const areTopicsComplete = config.topics.every(
    (topic) => topic.topik.trim() && topic.capaian.trim(),
  );

  const effectiveSubject = config.manualSubject.trim() || config.subject;

  const creditsBalance = user?.credits_balance ?? 0;
  const estimatedCost = config.topics.length * config.subChapters * EMODUL_COST_PER_SUBBAB;
  const isInsufficientCredits = estimatedCost > creditsBalance;

  const addTopic = () => update("topics", [...config.topics, { topik: "", capaian: "" }]);

  const removeTopic = (index: number) => {
    if (config.topics.length <= 1) {
      return;
    }
    update("topics", config.topics.filter((_, i) => i !== index));
  };

  const updateTopic = (index: number, field: keyof EModulTopic, value: string) => {
    update(
      "topics",
      config.topics.map((topic, i) => (i === index ? { ...topic, [field]: value } : topic)),
    );
  };

  const handleFaseChange = (fase: string | null) => {
    if (!fase) {
      return;
    }

    setConfig((current) => ({
      ...current,
      fase,
      kelas: `Kelas ${KELAS_OPTIONS_BY_FASE[fase][0]}`,
      subject: SUBJECT_OPTIONS_BY_FASE[fase][0],
    }));
  };

  const handleNext = () => {
    if (step === 1 && !areTopicsComplete) {
      setErrorMsg("Setiap topik dan capaian pembelajaran wajib diisi.");
      return;
    }

    setErrorMsg(null);
    setStep((current) => Math.min(current + 1, 3));
  };

  const handlePrev = () => {
    setErrorMsg(null);
    setStep((current) => Math.max(current - 1, 1));
  };

  const handleGenerate = async () => {
    if (isInsufficientCredits) {
      setErrorMsg(
        `Kredit tidak cukup untuk struktur ini (butuh ${estimatedCost}, saldo ${creditsBalance}).`,
      );
      setBillingOpen(true);
      return;
    }

    setIsGenerating(true);
    setProgress(8);
    setErrorMsg(null);

    try {
      const result = await emodulApi.generate({
        topics: config.topics,
        fase: config.fase,
        kelas: config.kelas,
        subject: effectiveSubject,
        semester: config.semester,
        chapters: config.topics.length,
        subChapters: config.subChapters,
        exerciseShare: config.exerciseShare,
      });

      setProgress(100);
      await refreshUser();
      navigate(`${EMODUL_PATH}/${result.e_modul_id}`);
    } catch (error) {
      setIsGenerating(false);
      setProgress(0);

      // Kredit habis / butuh premium: arahkan ke billing dengan pesan dari server.
      if (error instanceof ApiError && error.response?.status === 402) {
        setErrorMsg(error.response.data.message ?? "Kredit atau paket tidak mencukupi.");
        setBillingOpen(true);
        return;
      }

      setErrorMsg(
        error instanceof Error
          ? `Gagal membuat e-modul: ${error.message}`
          : "Gagal membuat e-modul. Periksa koneksi lalu coba lagi.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-in fade-in duration-500">
      {isGenerating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-bold text-slate-900">Menyusun e-modul...</h2>
            <p className="mt-1 text-sm text-slate-500">AI sedang merancang bab, subbab, dan latihan.</p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs font-semibold text-emerald-600">{progress}%</p>
          </div>
        </div>
      )}

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Buat E-Modul Baru</h1>
        <p className="text-slate-500">Isi topik, jenjang, dan struktur modul — AI menyusun drafnya.</p>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Stepper */}
      <div className="relative mb-12 flex items-center justify-between">
        <div className="absolute left-0 top-1/2 z-0 h-1 w-full -translate-y-1/2 rounded-full bg-slate-200"></div>
        <div
          className="absolute left-0 top-1/2 z-0 h-1 -translate-y-1/2 rounded-full bg-emerald-600 transition-all duration-500"
          style={{ width: `${((step - 1) / 2) * 100}%` }}
        ></div>

        {[
          { num: 1, title: "Topik & Capaian", icon: BookOpen },
          { num: 2, title: "Jenjang & Mapel", icon: Settings },
          { num: 3, title: "Struktur", icon: Layers },
        ].map((s) => (
          <div key={s.num} className="relative z-10 flex flex-col items-center gap-2">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full border-4 transition-colors duration-300 ${
                step >= s.num
                  ? "border-white bg-emerald-600 text-white shadow-md"
                  : "border-white bg-slate-100 text-slate-400"
              }`}
            >
              <s.icon className="h-5 w-5" />
            </div>
            <span className={`text-sm font-medium ${step >= s.num ? "text-emerald-900" : "text-slate-400"}`}>
              {s.title}
            </span>
          </div>
        ))}
      </div>

      <div className="min-h-[400px] rounded-2xl border bg-white p-6 shadow-sm md:p-8">
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <h2 className="border-b pb-4 text-xl font-bold">Topik &amp; Capaian Pembelajaran</h2>

            <div className="space-y-4">
              {config.topics.map((topic, index) => (
                <div key={index} className="space-y-4 rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-600">Topik {index + 1}</span>
                    {config.topics.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => removeTopic(index)}
                        title="Hapus topik"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`emodul-topik-${index}`}>
                      Topik <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id={`emodul-topik-${index}`}
                      value={topic.topik}
                      onChange={(event) => updateTopic(index, "topik", event.target.value)}
                      placeholder="Contoh: Ekosistem dan keseimbangan lingkungan"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`emodul-capaian-${index}`}>
                      Capaian / Tujuan Pembelajaran <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id={`emodul-capaian-${index}`}
                      value={topic.capaian}
                      onChange={(event) => updateTopic(index, "capaian", event.target.value)}
                      placeholder="Contoh: Peserta didik mampu menjelaskan komponen ekosistem dan rantai makanan."
                      rows={3}
                    />
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addTopic} className="w-full border-dashed">
                <Plus className="mr-1.5 h-4 w-4" />
                Tambah Topik
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <h2 className="border-b pb-4 text-xl font-bold">Jenjang &amp; Mata Pelajaran</h2>

            <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Fase</Label>
                <Select value={config.fase} onValueChange={handleFaseChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Fase" />
                  </SelectTrigger>
                  <SelectContent>
                    {FASE_OPTIONS.map((fase) => (
                      <SelectItem key={fase} value={fase}>{fase}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Kelas</Label>
                <Select key={config.fase} value={config.kelas} onValueChange={(value) => value && update("kelas", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {KELAS_OPTIONS_BY_FASE[config.fase].map((kelas) => (
                      <SelectItem key={kelas} value={`Kelas ${kelas}`}>Kelas {kelas}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mata Pelajaran</Label>
                <Select value={config.subject} onValueChange={(value) => value && update("subject", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Mata Pelajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECT_OPTIONS_BY_FASE[config.fase].map((subject) => (
                      <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emodul-manual-subject">Mata Pelajaran Lain (opsional)</Label>
                <Input
                  id="emodul-manual-subject"
                  value={config.manualSubject}
                  onChange={(event) => update("manualSubject", event.target.value)}
                  placeholder="Kosongkan bila memakai pilihan di atas"
                />
              </div>

              <div className="space-y-2">
                <Label>Semester</Label>
                <Select value={config.semester} onValueChange={(value) => value && update("semester", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Semester" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTER_OPTIONS.map((semester) => (
                      <SelectItem key={semester} value={semester}>{semester}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <h2 className="border-b pb-4 text-xl font-bold">Struktur Modul</h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                <p className="font-semibold">Satu materi menjadi satu BAB</p>
                <p className="mt-1">Jumlah BAB otomatis mengikuti {config.topics.length} materi yang Anda masukkan. Setiap BAB memuat pertanyaan pemantik, peta konsep, pendalaman materi, aktivitas, dan uji capaian pembelajaran.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emodul-subchapters">Jumlah submateri per BAB</Label>
                <Input
                  id="emodul-subchapters"
                  type="number"
                  min={1}
                  max={6}
                  value={config.subChapters}
                  onChange={(event) => update("subChapters", Math.max(1, Math.min(6, Number(event.target.value) || 1)))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="emodul-exercise">Porsi Latihan ({config.exerciseShare}%)</Label>
              <input
                id="emodul-exercise"
                type="range"
                min={0}
                max={60}
                step={5}
                value={config.exerciseShare}
                onChange={(event) => update("exerciseShare", Number(event.target.value))}
                className="w-full accent-emerald-600"
              />
              <p className="text-xs text-slate-500">
                Struktur mencakup {config.topics.length} BAB, masing-masing dengan tepat {config.subChapters} submateri pengembangan.
              </p>
            </div>

            {/* Ringkasan konfirmasi sebelum generate */}
            <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <h3 className="text-sm font-bold text-emerald-800">Ringkasan Modul</h3>

              <dl className="space-y-2 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 text-slate-500">Topik</dt>
                  <dd className="text-right">
                    <ul className="space-y-0.5">
                      {config.topics.map((topic, index) => (
                        <li key={index} className="font-medium text-slate-800">
                          {topic.topik.trim() || "—"}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Jenjang</dt>
                  <dd className="font-medium text-slate-800">{config.fase} · {config.kelas}</dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Mata Pelajaran</dt>
                  <dd className="font-medium text-slate-800">{effectiveSubject}</dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Semester</dt>
                  <dd className="font-medium text-slate-800">{config.semester}</dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Struktur</dt>
                  <dd className="font-medium text-slate-800">
                    {config.topics.length} materi = {config.topics.length} BAB
                    <span className="text-slate-500"> · {config.subChapters} submateri bernomor per BAB</span>
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Porsi Latihan</dt>
                  <dd className="font-medium text-slate-800">{config.exerciseShare}%</dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Estimasi Biaya</dt>
                  <dd className="font-medium text-slate-800">{estimatedCost} kredit</dd>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Saldo Kredit</dt>
                  <dd
                    className={
                      isInsufficientCredits
                        ? "font-medium text-red-600"
                        : "font-medium text-slate-800"
                    }
                  >
                    {creditsBalance} kredit
                  </dd>
                </div>
              </dl>

              <p className="text-xs text-slate-500">
                Periksa kembali ringkasan di atas sebelum membuat e-modul. Estimasi biaya
                memakai 1 kredit per bagian pengembangan.
              </p>
            </div>

            {isInsufficientCredits && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">Kredit tidak cukup</p>
                    <p className="text-sm">
                      Struktur ini butuh {estimatedCost} kredit, saldo Anda {creditsBalance} kredit.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setBillingOpen(true)}
                  className="shrink-0 rounded-full bg-amber-600 text-white hover:bg-amber-700"
                >
                  Top up kredit
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handlePrev} disabled={step === 1 || isGenerating} className="w-32">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali
        </Button>

        {step < 3 ? (
          <Button onClick={handleNext} className="w-32 bg-emerald-600 hover:bg-emerald-700">
            Lanjut
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => void handleGenerate()}
            disabled={isGenerating || isInsufficientCredits}
            className="w-44 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg hover:from-emerald-700 hover:to-teal-700"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Buat E-Modul
          </Button>
        )}
      </div>

      <BillingDialog
        open={billingOpen}
        onOpenChange={(open) => {
          setBillingOpen(open);
          if (!open) {
            void refreshUser();
          }
        }}
        defaultTab="topup"
      />
    </div>
  );
}
