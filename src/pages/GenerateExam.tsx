import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  FileText,
  Settings,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Upload,
  Plus,
  X,
  Minus,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { examsApi, type GenerateExamPayload } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function GenerateExam() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFase, setSelectedFase] = useState("Fase A");
  const [mapel, setMapel] = useState("");
  const [curriculum, setCurriculum] = useState("Merdeka Deep Learning");
  const [examType, setExamType] = useState("Sumatif Akhir Semester (SAS)");
  const [selectedKelas, setSelectedKelas] = useState("Kelas 1");
  const [semester, setSemester] = useState("Ganjil");
  const [timeAllocation, setTimeAllocation] = useState("90");
  const [referenceType, setReferenceType] = useState<"AI" | "PDF" | "Manual">(
    "AI",
  );
  const [referenceText, setReferenceText] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [difficulty, setDifficulty] = useState("Campuran Berimbang");
  const [pgOptions, setPgOptions] = useState("3 Opsi (A–C)");
  const [withIllustration, setWithIllustration] = useState(true);
  const [cogLevels, setCogLevels] = useState<string[]>([
    "C1 - Mengingat",
    "C2 - Memahami",
    "C3 - Mengaplikasikan",
    "C4 - Menganalisis",
  ]);

  const [topics, setTopics] = useState([{ topik: "", tujuan: "" }]);

  const addTopic = () => setTopics([...topics, { topik: "", tujuan: "" }]);
  const removeTopic = (index: number) => {
    if (topics.length > 1) {
      setTopics(topics.filter((_, i) => i !== index));
    }
  };
  const updateTopic = (
    index: number,
    field: "topik" | "tujuan",
    value: string,
  ) => {
    const newTopics = [...topics];
    newTopics[index][field] = value;
    setTopics(newTopics);
  };

  const toggleCogLevel = (level: string) => {
    setCogLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
  };

  const [formats, setFormats] = useState([
    { id: "pg", label: "Pilihan Ganda", active: true, count: 20 },
    { id: "pgk", label: "Pilihan Ganda Kompleks", active: true, count: 5 },
    { id: "jodoh", label: "Menjodohkan", active: true, count: 5 },
    { id: "bs", label: "Benar / Salah", active: false, count: 5 },
    { id: "isian", label: "Isian Singkat", active: false, count: 5 },
    { id: "uraian", label: "Uraian", active: false, count: 5 },
  ]);

  const totalSoal = formats.reduce(
    (acc, curr) => (curr.active ? acc + curr.count : acc),
    0,
  );
  const activeFormatCount = formats.filter((format) => format.active).length;

  const progressStages = [
    { min: 0, label: "Memvalidasi data ujian..." },
    { min: 16, label: "Menyusun materi dan format soal..." },
    { min: 34, label: "Menghubungi model AI..." },
    {
      min: 58,
      label: withIllustration
        ? "Membuat ilustrasi terpilih..."
        : "Merapikan struktur soal...",
    },
    { min: 76, label: "Menyimpan soal dan kunci jawaban..." },
    { min: 92, label: "Menyiapkan halaman review..." },
  ];

  const activeProgressStage =
    [...progressStages].reverse().find((stage) => generateProgress >= stage.min)
      ?.label ?? progressStages[0].label;

  useEffect(() => {
    if (!isGenerating) {
      document.body.style.overflow = "";
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const interval = window.setInterval(() => {
      setGenerateProgress((current) => {
        if (current >= 94) {
          return current;
        }

        const increment = current < 35 ? 4 : current < 70 ? 2 : 1;
        return Math.min(94, current + increment);
      });
    }, 900);

    return () => {
      window.clearInterval(interval);
      document.body.style.overflow = previousOverflow;
    };
  }, [isGenerating]);

  const toggleFormat = (index: number) => {
    const newFormats = [...formats];
    newFormats[index].active = !newFormats[index].active;
    setFormats(newFormats);
  };

  const updateFormatCount = (index: number, delta: number) => {
    const newFormats = [...formats];
    const newCount = newFormats[index].count + delta;
    if (newCount >= 1) {
      newFormats[index].count = newCount;
      setFormats(newFormats);
    }
  };

  const kelasOptions: Record<string, number[]> = {
    "Fase A": [1, 2],
    "Fase B": [3, 4],
    "Fase C": [5, 6],
    "Fase D": [7, 8],
    "Fase E": [10],
    "Fase F": [11, 12],
  };

  const handleFaseChange = (fase: string | null) => {
    if (!fase) {
      return;
    }

    setSelectedFase(fase);
    setSelectedKelas(`Kelas ${kelasOptions[fase][0]}`);
  };

  const handleNext = () => setStep((s) => Math.min(s + 1, 3));
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  const appendArray = (formData: FormData, key: string, items: unknown[]) => {
    items.forEach((item, index) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        Object.entries(item as Record<string, unknown>).forEach(
          ([field, value]) => {
            formData.append(`${key}[${index}][${field}]`, String(value ?? ""));
          },
        );
      } else {
        formData.append(`${key}[${index}]`, String(item ?? ""));
      }
    });
  };

  const buildGenerateRequest = (payload: GenerateExamPayload) => {
    if (referenceType !== "PDF") {
      return payload;
    }

    const formData = new FormData();
    formData.append("curriculum", payload.curriculum);
    formData.append("exam_type", payload.exam_type);
    formData.append("class_phase", payload.class_phase);
    formData.append("subject", payload.subject);
    formData.append("semester", payload.semester);
    formData.append("time_allocation", String(payload.time_allocation));
    formData.append("reference_type", payload.reference_type);
    formData.append("difficulty", payload.difficulty);
    formData.append("pg_options", payload.pg_options ?? "");
    formData.append(
      "include_illustration",
      payload.include_illustration ? "1" : "0",
    );
    appendArray(formData, "cognitive_levels", payload.cognitive_levels);
    appendArray(formData, "topics", payload.topics);
    appendArray(formData, "formats", payload.formats);
    if (referenceFile) {
      formData.append("reference_file", referenceFile);
    }

    return formData;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateProgress(8);
    setErrorMsg(null);

    const activeFormats = formats
      .filter((f) => f.active)
      .map(({ id, label, count }) => ({ id, label, count }));

    const payload: GenerateExamPayload = {
      curriculum,
      exam_type: examType,
      class_phase: `${selectedFase} - ${selectedKelas}`,
      subject: mapel,
      semester,
      time_allocation: parseInt(timeAllocation),
      reference_type: referenceType,
      reference_text: referenceType === "Manual" ? referenceText : undefined,
      reference_file: referenceType === "PDF" ? referenceFile : null,
      difficulty,
      cognitive_levels: cogLevels,
      pg_options: pgOptions,
      include_illustration: withIllustration,
      topics,
      formats: activeFormats,
    };

    try {
      const res = await examsApi.generate(buildGenerateRequest(payload));
      setGenerateProgress(100);
      const { exam, questions, credits_remaining } = res.data;
      updateUser({ credits_balance: credits_remaining });

      await new Promise((resolve) => window.setTimeout(resolve, 350));

      // Navigate to review with exam data
      navigate("/review", {
        state: {
          examId: exam.id,
          exam,
          questions,
          creditsRemaining: credits_remaining,
        },
      });
    } catch (err: unknown) {
      setGenerateProgress(0);
      const axiosErr = err as {
        response?: {
          status?: number;
          data?: {
            message?: string;
            error?: string;
            errors?: Record<string, string[]>;
          };
        };
        message?: string;
      };
      const validationMessage = axiosErr.response?.data?.errors
        ? Object.values(axiosErr.response.data.errors).flat()[0]
        : undefined;
      const msg =
        validationMessage ??
        axiosErr.response?.data?.message ??
        (axiosErr.response?.status === 401
          ? "Sesi login belum aktif. Silakan login/register ulang agar token tersimpan."
          : undefined) ??
        "Terjadi kesalahan. Pastikan server backend berjalan di http://localhost:8000";
      setErrorMsg(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      {isGenerating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Sedang Membuat Soal
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Mohon tunggu. Jangan tutup halaman sampai proses selesai.
                </p>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                {activeProgressStage}
              </span>
              <span className="text-sm font-bold tabular-nums text-indigo-700">
                {generateProgress}%
              </span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-700"
                style={{ width: `${generateProgress}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
              <div className="rounded-lg bg-slate-50 px-2 py-2">
                <span className="block font-bold text-slate-800">
                  {totalSoal}
                </span>
                soal
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-2">
                <span className="block font-bold text-slate-800">
                  {activeFormatCount}
                </span>
                format
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-2">
                <span className="block font-bold text-slate-800">
                  {withIllustration ? "Aktif" : "Nonaktif"}
                </span>
                ilustrasi
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">
          Buat Soal Ujian Baru
        </h1>
        <p className="text-slate-500">
          Isi formulir berikut untuk menghasilkan soal secara otomatis.
        </p>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center justify-between relative mb-12">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded-full z-0"></div>
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-600 rounded-full z-0 transition-all duration-500"
          style={{ width: `${((step - 1) / 2) * 100}%` }}
        ></div>

        {[
          { num: 1, title: "Dasar", icon: BookOpen },
          { num: 2, title: "Materi", icon: FileText },
          { num: 3, title: "Kriteria", icon: Settings },
        ].map((s) => (
          <div
            key={s.num}
            className="relative z-10 flex flex-col items-center gap-2"
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-colors duration-300 ${
                step >= s.num
                  ? "bg-indigo-600 border-white text-white shadow-md"
                  : "bg-slate-100 border-white text-slate-400"
              }`}
            >
              <s.icon className="w-5 h-5" />
            </div>
            <span
              className={`text-sm font-medium ${step >= s.num ? "text-indigo-900" : "text-slate-400"}`}
            >
              {s.title}
            </span>
          </div>
        ))}
      </div>

      {/* Form Content */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8 min-h-[400px]">
        {/* STEP 1: DASAR */}
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <h2 className="text-xl font-bold border-b pb-4">Informasi Dasar</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <div>
                  <Label>
                    Kurikulum <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Pilih kurikulum yang berlaku di sekolah Anda.
                  </p>
                </div>
                <Select
                  value={curriculum}
                  onValueChange={(val) => val && setCurriculum(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Kurikulum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Merdeka Deep Learning">
                      Merdeka Deep Learning
                    </SelectItem>
                    <SelectItem value="Kurikulum 2013">
                      Kurikulum 2013
                    </SelectItem>
                    <SelectItem value="KBC / Madrasah">
                      KBC / Madrasah
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div>
                  <Label>
                    Jenis Ujian <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Tentukan jenis evaluasi yang akan dibuat.
                  </p>
                </div>
                <Select
                  value={examType}
                  onValueChange={(val) => val && setExamType(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Jenis Ujian" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sumatif Akhir Semester (SAS)">
                      Sumatif Akhir Semester (SAS)
                    </SelectItem>
                    <SelectItem value="Sumatif Tengah Semester (STS)">
                      Sumatif Tengah Semester (STS)
                    </SelectItem>
                    <SelectItem value="Ulangan Harian">
                      Ulangan Harian
                    </SelectItem>
                    <SelectItem value="Ujian Sekolah">Ujian Sekolah</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div>
                  <Label>
                    Fase <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Pilih fase pendidikan sesuai tingkat kelas.
                  </p>
                </div>
                <Select value={selectedFase} onValueChange={handleFaseChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Fase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fase A">Fase A</SelectItem>
                    <SelectItem value="Fase B">Fase B</SelectItem>
                    <SelectItem value="Fase C">Fase C</SelectItem>
                    <SelectItem value="Fase D">Fase D</SelectItem>
                    <SelectItem value="Fase E">Fase E</SelectItem>
                    <SelectItem value="Fase F">Fase F</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div>
                  <Label>
                    Kelas <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Pilih kelas spesifik untuk ujian ini.
                  </p>
                </div>
                <Select
                  key={selectedFase}
                  value={selectedKelas}
                  onValueChange={(val) => val && setSelectedKelas(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {kelasOptions[selectedFase].map((cls) => (
                      <SelectItem key={cls} value={`Kelas ${cls}`}>
                        Kelas {cls}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div>
                  <Label>
                    Semester <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Tentukan semester pelaksanaan ujian.
                  </p>
                </div>
                <Select
                  value={semester}
                  onValueChange={(val) => val && setSemester(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ganjil">Ganjil</SelectItem>
                    <SelectItem value="Genap">Genap</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div>
                  <Label>
                    Alokasi Waktu <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Estimasi waktu yang diberikan kepada siswa untuk pengerjaan.
                  </p>
                </div>
                <Select
                  value={timeAllocation}
                  onValueChange={(val) => val && setTimeAllocation(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Waktu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="45">45 Menit</SelectItem>
                    <SelectItem value="60">60 Menit</SelectItem>
                    <SelectItem value="90">90 Menit</SelectItem>
                    <SelectItem value="120">120 Menit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <div>
                  <Label>
                    Mata Pelajaran <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Tuliskan nama mata pelajaran secara spesifik.
                  </p>
                </div>
                <Input
                  value={mapel}
                  onChange={(e) => setMapel(e.target.value)}
                  placeholder="Contoh: Matematika, IPAS, Bahasa Indonesia"
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: MATERI */}
        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <h2 className="text-xl font-bold border-b pb-4">
              Materi Pembelajaran
            </h2>

            <div className="space-y-6">
              <div className="space-y-4">
                {topics.map((item, index) => (
                  <div
                    key={index}
                    className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 relative"
                  >
                    {topics.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                        onClick={() => removeTopic(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    <div className="space-y-4 pr-6">
                      <div className="space-y-2">
                        <div>
                          <Label>
                            Topik Pembelajaran{" "}
                            {topics.length > 1 ? index + 1 : ""}
                          </Label>
                          <p className="text-sm text-slate-500 mt-0.5">
                            Tuliskan materi pokok yang akan diujikan.
                          </p>
                        </div>
                        <Input
                          value={item.topik}
                          onChange={(e) =>
                            updateTopic(index, "topik", e.target.value)
                          }
                          placeholder="Contoh: Pecahan Senilai dan Operasi Hitung"
                          className="bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <div>
                          <Label>Tujuan Pembelajaran (Opsional)</Label>
                          <p className="text-sm text-slate-500 mt-0.5">
                            Tambahkan Capaian Pembelajaran atau tujuan spesifik
                            agar soal lebih relevan.
                          </p>
                        </div>
                        <Textarea
                          value={item.tujuan}
                          onChange={(e) =>
                            updateTopic(index, "tujuan", e.target.value)
                          }
                          placeholder="Contoh: Siswa dapat menyelesaikan masalah terkait operasi tambah pecahan senilai..."
                          rows={2}
                          className="bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={addTopic}
                  className="w-full text-indigo-600 border-indigo-200 border-dashed hover:bg-indigo-50"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Tambah Topik & Tujuan Baru
                </Button>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div>
                  <Label className="text-base font-semibold">
                    Sumber Referensi Materi
                  </Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Pilih dari mana sistem akan mengambil referensi soal.
                    Disarankan pakai AI Otomatis untuk hasil terbaik.
                  </p>
                </div>
                <RadioGroup
                  value={referenceType}
                  onValueChange={(v) =>
                    setReferenceType(v as "AI" | "PDF" | "Manual")
                  }
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  <div className="relative">
                    <RadioGroupItem
                      value="AI"
                      id="ref-sistem"
                      className="hidden"
                    />
                    <Label
                      htmlFor="ref-sistem"
                      className={`relative flex flex-col items-center justify-between rounded-xl border-2 bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer text-center h-full ${referenceType === "AI" ? "border-indigo-600 bg-indigo-50" : "border-muted"}`}
                    >
                      <span className="absolute right-3 top-3 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                        Rekomendasi
                      </span>
                      <Sparkles className="mb-2 h-6 w-6 text-indigo-500" />
                      <span className="font-semibold">AI Otomatis</span>
                      <span className="text-xs font-normal text-slate-500 mt-1">
                        Sistem mencari referensi terbaik secara otomatis
                      </span>
                    </Label>
                  </div>
                  <div className="relative">
                    <RadioGroupItem
                      value="PDF"
                      id="ref-pdf"
                      className="hidden"
                    />
                    <Label
                      htmlFor="ref-pdf"
                      className={`flex flex-col items-center justify-between rounded-xl border-2 bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer text-center h-full ${referenceType === "PDF" ? "border-indigo-600 bg-indigo-50" : "border-muted"}`}
                    >
                      <Upload className="mb-2 h-6 w-6 text-indigo-500" />
                      <span className="font-semibold">Unggah PDF</span>
                      <span className="text-xs font-normal text-slate-500 mt-1">
                        Upload materi PDF Anda
                      </span>
                    </Label>
                  </div>
                  <div className="relative">
                    <RadioGroupItem
                      value="Manual"
                      id="ref-text"
                      className="hidden"
                    />
                    <Label
                      htmlFor="ref-text"
                      className={`flex flex-col items-center justify-between rounded-xl border-2 bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer text-center h-full ${referenceType === "Manual" ? "border-indigo-600 bg-indigo-50" : "border-muted"}`}
                    >
                      <FileText className="mb-2 h-6 w-6 text-indigo-500" />
                      <span className="font-semibold">Teks Manual</span>
                      <span className="text-xs font-normal text-slate-500 mt-1">
                        Ketik/Paste materi secara langsung
                      </span>
                    </Label>
                  </div>
                </RadioGroup>

                {referenceType === "PDF" && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2">
                    <Label htmlFor="reference-pdf">File PDF Materi</Label>
                    <Input
                      id="reference-pdf"
                      type="file"
                      accept="application/pdf"
                      className="bg-white"
                      onChange={(e) =>
                        setReferenceFile(e.target.files?.[0] ?? null)
                      }
                    />
                    {referenceFile && (
                      <p className="text-xs text-slate-500">
                        Dipilih: {referenceFile.name}
                      </p>
                    )}
                  </div>
                )}

                {referenceType === "Manual" && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2">
                    <Label htmlFor="reference-text">Teks Materi</Label>
                    <Textarea
                      id="reference-text"
                      value={referenceText}
                      onChange={(e) => setReferenceText(e.target.value)}
                      rows={6}
                      className="bg-white"
                      placeholder="Tempelkan ringkasan materi, kutipan buku, atau catatan pembelajaran yang ingin dijadikan sumber soal."
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: KRITERIA */}
        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <h2 className="text-xl font-bold border-b pb-4">Kriteria Soal</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <div>
                  <Label>Tingkat Kesulitan</Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Pilih sesuai kemampuan siswa dan tujuan penilaian Anda.
                  </p>
                </div>
                <Select
                  value={difficulty}
                  onValueChange={(val) => val && setDifficulty(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Kesulitan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mudah (LOTS)">Mudah (LOTS)</SelectItem>
                    <SelectItem value="Sedang (MOTS)">Sedang (MOTS)</SelectItem>
                    <SelectItem value="Sulit (HOTS)">Sulit (HOTS)</SelectItem>
                    <SelectItem value="Campuran Berimbang">
                      Campuran Berimbang
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <Label>Level Kognitif (Taksonomi Bloom)</Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Pilih satu atau lebih level. C1-C2 mudah, C3-C4 sedang,
                    C5-C6 sulit.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "C1 - Mengingat",
                    "C2 - Memahami",
                    "C3 - Mengaplikasikan",
                    "C4 - Menganalisis",
                    "C5 - Mengevaluasi",
                    "C6 - Mencipta",
                  ].map((level, i) => (
                    <div className="flex items-center space-x-2" key={i}>
                      <Checkbox
                        id={`c${i + 1}`}
                        checked={cogLevels.includes(level)}
                        onCheckedChange={() => toggleCogLevel(level)}
                      />
                      <label
                        htmlFor={`c${i + 1}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {level}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800">
                    Format & Jumlah Soal
                  </h3>
                  <p className="max-w-sm text-sm leading-relaxed text-slate-500">
                    Aktifkan format yang diinginkan, lalu atur jumlah soal tiap
                    format.
                  </p>
                </div>
                <div className="inline-flex w-fit items-center justify-center self-start rounded-full bg-indigo-600 px-3 py-1.5 text-center text-xs font-bold leading-tight text-white shadow-sm sm:self-auto sm:px-4 sm:text-sm">
                  Total: {totalSoal} soal
                </div>
              </div>

              <div className="space-y-3">
                {formats.map((format, idx) => (
                  <div
                    key={format.id}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${format.active ? "bg-indigo-50/50 border-indigo-200" : "bg-white border-slate-200"}`}
                  >
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={format.active}
                        onCheckedChange={() => toggleFormat(idx)}
                      />
                      <span
                        className={`font-medium ${format.active ? "text-slate-800" : "text-slate-400"}`}
                      >
                        {format.label}
                      </span>
                    </div>
                    {format.active && (
                      <div className="flex items-center gap-4 bg-white border rounded-lg px-2 py-1">
                        <button
                          onClick={() => updateFormatCount(idx, -1)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-600"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-semibold text-slate-800">
                          {format.count}
                        </span>
                        <button
                          onClick={() => updateFormatCount(idx, 1)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-600"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t mt-6">
                <div className="space-y-2">
                  <Label className="text-slate-500">Opsi Jawaban PG</Label>
                  <Select
                    value={pgOptions}
                    onValueChange={(val) => val && setPgOptions(val)}
                  >
                    <SelectTrigger className="w-full bg-white border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3 Opsi (A–C)">3 Opsi (A–C)</SelectItem>
                      <SelectItem value="4 Opsi (A–D)">4 Opsi (A–D)</SelectItem>
                      <SelectItem value="5 Opsi (A–E)">5 Opsi (A–E)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-3 p-2.5 px-4 w-full border rounded-xl bg-white h-[42px] border-slate-200">
                    <Switch
                      id="img-toggle"
                      checked={withIllustration}
                      onCheckedChange={setWithIllustration}
                    />
                    <Label
                      htmlFor="img-toggle"
                      className="flex items-center gap-2 cursor-pointer font-normal text-slate-700"
                    >
                      <ImageIcon className="w-4 h-4 text-slate-400" />
                      Gambar ilustrasi
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between items-center pt-4">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={step === 1 || isGenerating}
          className="w-32"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Kembali
        </Button>

        {step < 3 ? (
          <Button
            onClick={handleNext}
            className="w-32 bg-indigo-600 hover:bg-indigo-700"
            disabled={step === 1 && !mapel.trim()}
          >
            Lanjut
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-40 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg text-white"
          >
            {isGenerating ? (
              <span className="flex items-center animate-pulse">
                <Sparkles className="w-4 h-4 mr-2" /> Memproses...
              </span>
            ) : (
              <span className="flex items-center">
                <Sparkles className="w-4 h-4 mr-2" /> Buat Soal
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
