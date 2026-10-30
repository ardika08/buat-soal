import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import BillingDialog from "@/components/billing/BillingDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/invoke";
import { useAuth } from "@/lib/auth-context";
import { checkEModulStructure, type StructureFinding } from "@/lib/emodulStructure";
import {
  emodulApi,
  normalizeEModulSummary,
  type EModulChapter,
  type EModulDetail,
} from "@/lib/emodulApi";
import { HOME_PATH, emodulPreviewPath } from "@/lib/routes";

/**
 * Halaman editor e-modul ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â tersambung ke backend nyata.
 *
 * Memuat draf lewat `emodul-detail`, menyimpan tiap suntingan ke server lewat
 * `emodul-autosave` (ter-debounce), mengelola susunan lewat `emodul-manage`, dan
 * regenerasi bagian lewat `emodul-regenerate`. Pemeriksaan struktur memakai
 * validator bersama (`emodulStructure`) supaya temuan di layar sama dengan yang
 * ditegakkan server.
 */
export default function EModulEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const eModulId = Number(id);

  const [detail, setDetail] = useState<EModulDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Bagian yang menunggu konfirmasi regenerasi di dialog. */
  const [regenTarget, setRegenTarget] = useState<{ chapterId: number; sectionId: number; label: string } | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [billingOpen, setBillingOpen] = useState(false);

  /** Timers autosave per bagian supaya setiap bagian ter-debounce sendiri. */
  const timers = useRef<Record<number, number>>({});

  // ID tidak valid adalah kondisi turunan (bukan kejadian), jadi ditangani saat
  // render ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â bukan lewat setState di dalam effect.
  const hasValidId = Number.isInteger(eModulId) && eModulId > 0;

  useEffect(() => {
    if (!hasValidId) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const loaded = await emodulApi.detail(eModulId);
        if (active) {
          setDetail(loaded);
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "Gagal memuat e-modul.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [eModulId, hasValidId]);

  // Bersihkan semua timer autosave yang masih berjalan saat halaman ditinggalkan.
  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      Object.values(currentTimers).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const isDirty = pendingSaves > 0;

  // Peringatkan guru bila menutup halaman saat masih ada simpanan yang tertunda.
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const saveLabel = isDirty
    ? "Menyimpan..."
    : saveError
      ? "Gagal menyimpan"
      : savedAt
        ? `Tersimpan ${savedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
        : "Tersimpan otomatis";

  const structure = useMemo(
    () =>
      detail
        ? checkEModulStructure({
            title: detail.eModul.title,
            topics: detail.eModul.topics,
            chapters: detail.chapters.map((chapter) => ({
              id: chapter.id,
              order: chapter.order,
              title: chapter.title,
              sections: chapter.sections,
            })),
          })
        : { ready: true, findings: [] as StructureFinding[], errorCount: 0, warningCount: 0, infoCount: 0 },
    [detail],
  );

  /** Elemen yang baru dituju dari daftar temuan ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â disorot sesaat. */
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const scrollToFinding = (finding: StructureFinding) => {
    let elementId: string | null = null;

    if (finding.sectionId && detail) {
      const chapter = detail.chapters.find((item) =>
        item.sections.some((section) => section.id === finding.sectionId),
      );
      const section = chapter?.sections.find((item) => item.id === finding.sectionId);

      if (chapter && section) {
        elementId = `subbab-${chapter.order}-${section.order}`;
      }
    }

    if (!elementId && finding.chapterId && detail) {
      const chapter = detail.chapters.find((item) => item.id === finding.chapterId);

      if (chapter) {
        elementId = `bab-${chapter.order}`;
      }
    }

    if (!elementId) {
      return;
    }

    const target = document.getElementById(elementId);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightId(elementId);

    window.setTimeout(() => {
      setHighlightId((current) => (current === elementId ? null : current));
    }, 1600);
  };

  /** Terapkan perubahan lokal ke state (optimistis) tanpa menyentuh server. */
  const mutate = useCallback((updater: (current: EModulDetail) => EModulDetail) => {
    setDetail((current) => {
      if (!current) {
        return current;
      }

      const next = updater(current);
      return {
        ...next,
        summary: normalizeEModulSummary(null, next.chapters),
      };
    });
  }, []);

  /**
   * Jadwalkan autosave satu bagian. Perubahan judul/isi langsung tampil, tetapi
   * baru dikirim ke server setelah guru berhenti mengetik `DEBOUNCE_MS`.
   */
  const scheduleAutosave = useCallback(
    (sectionId: number, patch: { title?: string; content?: string }) => {
      setSaveError(null);
      setPendingSaves((count) => count + 1);

      const existing = timers.current[sectionId];
      if (existing) {
        window.clearTimeout(existing);
      }

      timers.current[sectionId] = window.setTimeout(() => {
        void (async () => {
          try {
            await emodulApi.autosaveSection(sectionId, patch);
            setSavedAt(new Date());
          } catch (error) {
            setSaveError(error instanceof Error ? error.message : "Gagal menyimpan bagian.");
          } finally {
            setPendingSaves((count) => Math.max(0, count - 1));
            delete timers.current[sectionId];
          }
        })();
      }, 1200);
    },
    [],
  );

  const updateChapterTitle = (chapterId: number, title: string) => {
    mutate((current) => mapChapter(current, chapterId, (chapter) => ({ ...chapter, title })));
  };

  const updateSection = (chapterId: number, sectionId: number, patch: { title?: string; content?: string }) => {
    mutate((current) =>
      mapChapter(current, chapterId, (chapter) => ({
        ...chapter,
        sections: chapter.sections.map((section) =>
          section.id === sectionId ? { ...section, ...patch } : section,
        ),
      })),
    );
    scheduleAutosave(sectionId, patch);
  };

  /** Tukar bab, kirim urutan baru ke server, lalu selaraskan dengan hasilnya. */
  const moveChapter = async (chapterId: number, direction: -1 | 1) => {
    if (!detail) {
      return;
    }

    const index = detail.chapters.findIndex((chapter) => chapter.id === chapterId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= detail.chapters.length) {
      return;
    }

    const ordered = [...detail.chapters];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const orderedIds = ordered.map((chapter) => chapter.id);

    await runManage(
      () => emodulApi.manage({ action: "reorder_chapters", eModulId, chapterIds: orderedIds }),
      () => emodulApi.detail(eModulId),
    );
  };

  /** Tukar subbab di dalam bab, kirim urutan baru ke server. */
  const moveSection = async (chapterId: number, sectionId: number, direction: -1 | 1) => {
    if (!detail) {
      return;
    }

    const chapter = detail.chapters.find((item) => item.id === chapterId);
    if (!chapter) {
      return;
    }

    const index = chapter.sections.findIndex((section) => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= chapter.sections.length) {
      return;
    }

    const ordered = [...chapter.sections];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const orderedIds = ordered.map((section) => section.id);

    await runManage(
      () => emodulApi.manage({ action: "reorder_sections", chapterId, sectionIds: orderedIds }),
      () => emodulApi.detail(eModulId),
    );
  };

  const addChapter = () => {
    void runManage(
      () => emodulApi.manage({ action: "add_chapter", eModulId }),
      () => emodulApi.detail(eModulId),
    );
  };

  const removeChapter = (chapterId: number) => {
    if (!window.confirm("Hapus bab ini beserta seluruh subbabnya?")) {
      return;
    }

    void runManage(
      () => emodulApi.manage({ action: "delete_chapter", chapterId }),
      () => emodulApi.detail(eModulId),
    );
  };

  const addSection = (chapterId: number, kind: "materi" | "latihan") => {
    void runManage(
      () => emodulApi.manage({ action: "add_section", chapterId, kind }),
      () => emodulApi.detail(eModulId),
    );
  };

  const removeSection = (sectionId: number) => {
    if (!window.confirm("Hapus bagian ini?")) {
      return;
    }

    void runManage(
      () => emodulApi.manage({ action: "delete_section", sectionId }),
      () => emodulApi.detail(eModulId),
    );
  };

  /** Jalankan aksi struktur; muat ulang detail bila sukses, atau tampilkan pesan. */
  const runManage = async (action: () => Promise<void>, reload: () => Promise<EModulDetail>) => {
    setSaveError(null);
    try {
      await action();
      const fresh = await reload();
      setDetail(fresh);
      setSavedAt(new Date());
    } catch (error) {
      if (error instanceof ApiError && error.response?.status === 402) {
        setBillingOpen(true);
        return;
      }
      setSaveError(error instanceof Error ? error.message : "Gagal memperbarui struktur modul.");
    }
  };

  /**
   * Regenerasi isi satu bagian lewat AI. Judul tidak berubah; isi lama diganti
   * hasil server, lalu state lokal diperbarui supaya editor menampilkannya.
   */
  const handleRegenerateSection = async () => {
    if (!regenTarget || regeneratingId !== null) {
      return;
    }

    const target = regenTarget;
    const instruction = regenInstruction;

    setRegenTarget(null);
    setRegenInstruction("");
    setRegeneratingId(target.sectionId);
    setSaveError(null);

    try {
      const result = await emodulApi.regenerateSection(target.sectionId, instruction);
      mutate((current) =>
        mapChapter(current, target.chapterId, (chapter) => ({
          ...chapter,
          sections: chapter.sections.map((section) =>
            section.id === target.sectionId ? { ...section, content: result.content } : section,
          ),
        })),
      );
      setSavedAt(new Date());
      await refreshUser();
    } catch (error) {
      if (error instanceof ApiError && error.response?.status === 402) {
        setBillingOpen(true);
      } else {
        setSaveError(error instanceof Error ? error.message : "Gagal membuat ulang bagian.");
      }
    } finally {
      setRegeneratingId(null);
    }
  };

  if (hasValidId && isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center justify-center py-24 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat e-modul...
      </div>
    );
  }

  if (!hasValidId || loadError || !detail) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">E-modul tidak bisa dibuka</h1>
        <p className="text-sm text-slate-500">{loadError ?? "Data modul tidak ditemukan."}</p>
        <Button variant="outline" onClick={() => navigate(HOME_PATH)} className="rounded-full">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Kembali ke Beranda
        </Button>
      </div>
    );
  }

  const draft = detail.eModul;
  const materiCount = detail.chapters.reduce(
    (sum, chapter) => sum + chapter.sections.filter((section) => section.kind === "materi").length,
    0,
  );
  const latihanCount = detail.chapters.reduce(
    (sum, chapter) => sum + chapter.sections.filter((section) => section.kind === "latihan").length,
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header draf */}
      <div className="space-y-3">
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{draft.subject}</span>
          <span aria-hidden="true">ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·</span>
          <span>{draft.fase} ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· {draft.kelas}</span>
          <span aria-hidden="true">ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·</span>
          <span>Semester {draft.semester}</span>
        </p>

        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{draft.title}</h1>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              saveError
                ? "bg-red-50 text-red-700 ring-red-100"
                : isDirty
                  ? "bg-amber-50 text-amber-700 ring-amber-100"
                  : savedAt
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-slate-50 text-slate-400 ring-slate-100"
            }`}
          >
            {isDirty ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : savedAt ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden="true" />
            )}
            {saveLabel}
          </div>

          <Link to={emodulPreviewPath(String(draft.id))}>
            <Button
              variant="outline"
              className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              <Eye className="mr-1.5 h-4 w-4" />
              Pratinjau &amp; Unduh
            </Button>
          </Link>
        </div>

        {saveError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span
            className={`rounded-full px-3 py-1 ring-1 ${
              draft.status === "ready"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                : "bg-amber-50 text-amber-700 ring-amber-100"
            }`}
          >
            {draft.status === "ready" ? "Siap" : "Draf"}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-100">
            {detail.chapters.length} bab
          </span>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 ring-1 ring-indigo-100">
            {materiCount} subbab materi
          </span>
          <span className="rounded-full bg-purple-50 px-3 py-1 text-purple-700 ring-1 ring-purple-100">
            {latihanCount} latihan
          </span>
          <span className="rounded-full bg-slate-50 px-3 py-1 text-slate-600 ring-1 ring-slate-100">
            {draft.credits_consumed} kredit
          </span>
        </div>
      </div>

      {/* Topik & Capaian */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500">Topik &amp; Capaian Pembelajaran</h2>
        <ul className="mt-3 space-y-3">
          {draft.topics.map((topic, index) => (
            <li key={index} className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">{topic.topik}</p>
              {topic.capaian && <p className="text-sm leading-6 text-slate-500">{topic.capaian}</p>}
            </li>
          ))}
        </ul>
      </div>

      {/* Daftar isi */}
      <nav className="rounded-xl border bg-white p-4 shadow-sm" aria-label="Daftar isi e-modul">
        <h2 className="text-sm font-semibold text-slate-500">Daftar Isi</h2>
        <ol className="mt-3 space-y-3">
          {detail.chapters.map((chapter) => (
            <li key={chapter.id}>
              <a
                href={`#bab-${chapter.order}`}
                className="text-sm font-semibold text-slate-800 transition-colors hover:text-emerald-700"
              >
                {chapter.title}
              </a>
              <ul className="mt-1 space-y-0.5 pl-4">
                {chapter.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#subbab-${chapter.order}-${section.order}`}
                      className="text-xs text-slate-500 transition-colors hover:text-emerald-700"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </nav>

      {/* Pemeriksaan struktur lokal */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-500">Pemeriksaan Struktur</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span
              className={`rounded-full px-3 py-1 ring-1 ${
                structure.ready
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                  : "bg-red-50 text-red-700 ring-red-100"
              }`}
            >
              {structure.ready ? "Struktur siap" : `${structure.errorCount} masalah`}
            </span>
            <span className="text-slate-400">
              {structure.warningCount} peringatan ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· {structure.infoCount} info
            </span>
          </div>
        </div>

        {structure.findings.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Struktur modul lengkap ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â tidak ada temuan.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {structure.findings.map((finding) => {
              const style =
                finding.severity === "error"
                  ? { row: "bg-red-50 text-red-700", icon: AlertCircle }
                  : finding.severity === "warning"
                    ? { row: "bg-amber-50 text-amber-800", icon: AlertTriangle }
                    : { row: "bg-slate-50 text-slate-600", icon: Info };
              const Icon = style.icon;
              const targetable = Boolean(finding.chapterId || finding.sectionId);

              return (
                <li key={finding.id}>
                  {targetable ? (
                    <button
                      type="button"
                      onClick={() => scrollToFinding(finding)}
                      title="Lompat ke bagian"
                      className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-opacity hover:opacity-75 ${style.row}`}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="flex-1">{finding.message}</span>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                    </button>
                  ) : (
                    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${style.row}`}>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{finding.message}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Isi bab */}
      <div className="space-y-4">
        {detail.chapters.map((chapter) => (
          <section
            key={chapter.id}
            id={`bab-${chapter.order}`}
            className={`scroll-mt-24 rounded-2xl border bg-white p-5 shadow-sm transition-shadow ${
              highlightId === `bab-${chapter.order}` ? "ring-2 ring-emerald-300" : ""
            }`}
          >
            <div className="flex items-center gap-3 border-b pb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                <BookOpen className="h-5 w-5" />
              </div>
              <input
                value={chapter.title}
                onChange={(event) => updateChapterTitle(chapter.id, event.target.value)}
                aria-label={`Judul bab ${chapter.order}`}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-bold text-slate-900 outline-none transition-colors hover:border-slate-200 focus:border-emerald-400 focus:bg-white"
              />
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={chapter.order === 1}
                  onClick={() => void moveChapter(chapter.id, -1)}
                  aria-label={`Naikkan bab ${chapter.order}`}
                  title="Naikkan bab"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={chapter.order === detail.chapters.length}
                  onClick={() => void moveChapter(chapter.id, 1)}
                  aria-label={`Turunkan bab ${chapter.order}`}
                  title="Turunkan bab"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  disabled={detail.chapters.length <= 1}
                  onClick={() => removeChapter(chapter.id)}
                  aria-label={`Hapus bab ${chapter.order}`}
                  title="Hapus bab"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {chapter.sections.map((section) => {
                const isLatihan = section.kind === "latihan";
                const label = isLatihan
                  ? `latihan ${chapter.order}.${section.order}`
                  : `subbab ${chapter.order}.${section.order}`;

                return (
                  <div
                    key={section.id}
                    id={`subbab-${chapter.order}-${section.order}`}
                    aria-busy={regeneratingId === section.id}
                    className={`scroll-mt-24 rounded-xl border p-4 transition-shadow ${
                      isLatihan ? "border-purple-100 bg-purple-50/50" : "border-slate-100 bg-slate-50/60"
                    } ${regeneratingId === section.id ? "opacity-70" : ""} ${
                      highlightId === `subbab-${chapter.order}-${section.order}`
                        ? "ring-2 ring-emerald-300"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isLatihan ? (
                        <ClipboardList className="h-4 w-4 shrink-0 text-purple-600" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                      )}
                      <input
                        value={section.title}
                        onChange={(event) =>
                          updateSection(chapter.id, section.id, { title: event.target.value })
                        }
                        aria-label={`Judul ${label}`}
                        disabled={regeneratingId === section.id}
                        className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-slate-800 outline-none transition-colors hover:border-slate-200 focus:bg-white ${
                          isLatihan ? "focus:border-purple-400" : "focus:border-emerald-400"
                        }`}
                      />
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={section.order === 1 || regeneratingId !== null}
                          onClick={() => void moveSection(chapter.id, section.id, -1)}
                          aria-label={`Naikkan ${label}`}
                          title="Naikkan bagian"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={section.order === chapter.sections.length || regeneratingId !== null}
                          onClick={() => void moveSection(chapter.id, section.id, 1)}
                          aria-label={`Turunkan ${label}`}
                          title="Turunkan bagian"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={regeneratingId !== null}
                          onClick={() => setRegenTarget({ chapterId: chapter.id, sectionId: section.id, label })}
                          aria-label={`Buat ulang ${label}`}
                          title="Buat ulang bagian ini (AI)"
                        >
                          {regeneratingId === section.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon-sm"
                          disabled={chapter.sections.length <= 1 || regeneratingId !== null}
                          onClick={() => removeSection(section.id)}
                          aria-label={`Hapus ${label}`}
                          title="Hapus bagian"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <textarea
                      value={section.content}
                      onChange={(event) =>
                        updateSection(chapter.id, section.id, { content: event.target.value })
                      }
                      aria-label={`Isi ${label}`}
                      rows={4}
                      disabled={regeneratingId === section.id}
                      className={`mt-2 w-full resize-y rounded-lg border border-transparent bg-transparent p-2 text-sm leading-6 text-slate-600 outline-none transition-colors hover:border-slate-200 focus:bg-white focus:text-slate-700 ${
                        isLatihan ? "focus:border-purple-400" : "focus:border-emerald-400"
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => addSection(chapter.id, "materi")}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Tambah Subbab
              </Button>
              <Button variant="outline" size="sm" onClick={() => addSection(chapter.id, "latihan")}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Tambah Latihan
              </Button>
            </div>
          </section>
        ))}

        <Button variant="outline" onClick={addChapter} className="w-full border-dashed">
          <Plus className="mr-1.5 h-4 w-4" />
          Tambah Bab
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Semua bagian disunting langsung dan tersimpan otomatis ke server. Urutan bisa dipindah,
          bagian bisa ditambah/dihapus/dibuat ulang, dan temuan pemeriksaan struktur bisa diklik
          untuk melompat ke bagiannya.
        </p>
      </div>

      <div>
        <Link to={HOME_PATH}>
          <Button variant="outline" className="rounded-full">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Kembali ke Beranda
          </Button>
        </Link>
      </div>

      <Dialog
        open={Boolean(regenTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRegenTarget(null);
            setRegenInstruction("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat ulang {regenTarget?.label ?? "bagian"}?</DialogTitle>
            <DialogDescription>
              AI akan menulis ulang isi bagian ini tanpa mengubah bagian lain (biaya 1 kredit).
              Isi lama akan tergantikan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label htmlFor="regen-instruction" className="text-xs font-semibold text-slate-500">
              Instruksi tambahan (opsional)
            </label>
            <Textarea
              id="regen-instruction"
              value={regenInstruction}
              onChange={(event) => setRegenInstruction(event.target.value)}
              placeholder="Contoh: buat lebih ringkas, tambahkan contoh nyata..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRegenTarget(null);
                setRegenInstruction("");
              }}
              disabled={regeneratingId !== null}
            >
              Batal
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void handleRegenerateSection()}
              disabled={regeneratingId !== null}
            >
              {regeneratingId !== null ? "Membuat..." : "Buat Ulang (1 kredit)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BillingDialog
        open={billingOpen}
        onOpenChange={(open) => {
          setBillingOpen(open);
          if (!open) {
            void refreshUser();
          }
        }}
        defaultTab="subscription"
      />
    </div>
  );
}

function mapChapter(
  detail: EModulDetail,
  chapterId: number,
  updater: (chapter: EModulChapter) => EModulChapter,
): EModulDetail {
  return {
    ...detail,
    chapters: detail.chapters.map((chapter) => (chapter.id === chapterId ? updater(chapter) : chapter)),
  };
}
