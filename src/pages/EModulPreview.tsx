import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileDown,
  FileQuestion,
  FileText,
  Loader2,
  Lock,
  Printer,
  School,
} from "lucide-react";
import BillingDialog from "@/components/billing/BillingDialog";
import EbookUpgradeDialog from "@/components/emodul/EbookUpgradeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import {
  clearEbookUpgradeIntent,
  isResumableIntent,
  loadEbookUpgradeIntent,
  saveEbookUpgradeIntent,
  type EbookResumeAction,
} from "@/lib/ebookUpgradeIntent";
import { emodulApi, type EModulDetail } from "@/lib/emodulApi";
import { ApiError } from "@/lib/invoke";
import { EMODUL_PATH, PLANS_PATH } from "@/lib/routes";
import {
  hasSchoolLetterhead,
  loadSchoolLetterhead,
  saveSchoolLetterhead,
  type SchoolLetterhead,
} from "@/lib/schoolLetterhead";

/**
 * Pratinjau & unduh dokumen e-modul Ã¢â‚¬â€ tersambung ke backend nyata.
 *
 * Draf dimuat lewat `emodul-detail`; berkas diunduh lewat `emodul-export`
 * (server menyusun PDF/DOCX dengan kop tersimpan), bukan dirender ulang di
 * browser dari data tiruan. Unduhan tetap manfaat langganan: pengguna gratis
 * diarahkan ke penawaran paket.
 */
export default function EModulPreview() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const eModulId = Number(id);

  const [detail, setDetail] = useState<EModulDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const editorPath = `${EMODUL_PATH}/${id}`;

  // ID tidak valid adalah kondisi turunan, ditangani saat render.
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
          setLoadError(error instanceof Error ? error.message : "Gagal memuat e-modul.");
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

  /**
   * Unduhan E-Modul adalah manfaat langganan. Konsisten dengan pemeriksaan yang
   * ada: premium tanpa tanggal kedaluwarsa berlaku selamanya; premium dengan
   * tanggal lewat dianggap free.
   */
  const isPremiumActive = Boolean(
    user
      && user.subscription_tier === "premium"
      && (!user.subscription_expiry || new Date(user.subscription_expiry) > new Date()),
  );

  const [billingOpen, setBillingOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

  const totalSections = detail
    ? detail.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0)
    : 0;
  const isEmpty = !detail || detail.chapters.length === 0 || totalSections === 0;

  const [downloadMessage, setDownloadMessage] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [letterhead, setLetterhead] = useState<SchoolLetterhead>(() => loadSchoolLetterhead());
  const [letterheadOpen, setLetterheadOpen] = useState(true);

  // Kop disimpan di perangkat ini. Server memakai kop-nya sendiri saat ekspor.
  useEffect(() => {
    saveSchoolLetterhead(letterhead);
  }, [letterhead]);

  const updateLetterhead = (key: keyof SchoolLetterhead, value: string) => {
    setLetterhead((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    if (!downloadMessage) {
      return;
    }

    const timer = window.setTimeout(() => setDownloadMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [downloadMessage]);

  const runDownload = async (format: "pdf" | "docx") => {
    if (!detail) {
      return;
    }

    setDownloadMessage(null);
    setDownloading(format);

    try {
      const file = await emodulApi.exportDocument(detail.eModul.id, format);
      triggerBase64Download(file.filename, file.mime, file.base64);
      setDownloadMessage({
        tone: "success",
        text: `${format.toUpperCase()} berhasil diunduh.`,
      });
    } catch (error) {
      if (error instanceof ApiError && error.response?.status === 402) {
        promptUpgrade(format === "pdf" ? "download_pdf" : "download_docx");
        return;
      }

      setDownloadMessage({
        tone: "error",
        text: error instanceof Error
          ? `Gagal mengunduh ${format.toUpperCase()}: ${error.message}`
          : `Gagal mengunduh ${format.toUpperCase()}.`,
      });
    } finally {
      setDownloading(null);
    }
  };

  const handleDownload = (format: "pdf" | "docx") => {
    if (!isPremiumActive) {
      promptUpgrade(format === "pdf" ? "download_pdf" : "download_docx");
      return;
    }

    void runDownload(format);
  };

  const promptUpgrade = (action: EbookResumeAction) => {
    saveEbookUpgradeIntent({
      return_to: `${location.pathname}${location.search}`,
      action,
      created_at: new Date().toISOString(),
    });
    setDownloadMessage({
      tone: "info",
      text: "Unduhan E-Modul tersedia untuk paket Premium. Pilih paket untuk membuka unduhan.",
    });
    setUpgradeOpen(true);
  };

  const [resumeDismissed, setResumeDismissed] = useState(false);

  const pendingResume = useMemo(() => {
    if (!isPremiumActive || resumeDismissed) {
      return null;
    }

    const intent = loadEbookUpgradeIntent();
    return isResumableIntent(intent, location.pathname) ? intent : null;
  }, [isPremiumActive, resumeDismissed, location.pathname]);

  const resumePendingDownload = () => {
    const action = pendingResume?.action;

    clearEbookUpgradeIntent();
    setResumeDismissed(true);

    if (action === "download_pdf") {
      void runDownload("pdf");
    } else if (action === "download_docx") {
      void runDownload("docx");
    }
  };

  if (hasValidId && isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center justify-center py-24 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat pratinjau...
      </div>
    );
  }

  if (!hasValidId || loadError || !detail) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Pratinjau tidak tersedia</h1>
        <p className="text-sm text-slate-500">{loadError ?? "Data modul tidak ditemukan."}</p>
        <Button variant="outline" onClick={() => navigate(editorPath)} className="rounded-full">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Kembali ke Editor
        </Button>
      </div>
    );
  }

  const draft = detail.eModul;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link to={editorPath}>
            <Button variant="ghost" className="mb-1 text-slate-500 hover:text-slate-900">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Editor
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Pratinjau Dokumen</h1>
          <p className="text-sm text-slate-500">Tampilan akhir e-modul sebelum diunduh.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => handleDownload("pdf")}
            disabled={isEmpty || downloading !== null}
            title={isPremiumActive ? undefined : "Unduhan tersedia untuk pelanggan Premium"}
            className={
              isPremiumActive
                ? "rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                : "rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }
          >
            {downloading === "pdf"
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : isPremiumActive
                ? <FileDown className="mr-1.5 h-4 w-4" />
                : <Lock className="mr-1.5 h-4 w-4" />}
            Unduh PDF{isPremiumActive ? "" : " (Premium)"}
          </Button>

          <Button
            variant="outline"
            onClick={() => handleDownload("docx")}
            disabled={isEmpty || downloading !== null}
            title={isPremiumActive ? undefined : "Unduhan tersedia untuk pelanggan Premium"}
            className={
              isPremiumActive
                ? "rounded-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                : "rounded-full border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }
          >
            {downloading === "docx"
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : isPremiumActive
                ? <FileDown className="mr-1.5 h-4 w-4" />
                : <Lock className="mr-1.5 h-4 w-4" />}
            Unduh DOCX{isPremiumActive ? "" : " (Premium)"}
          </Button>

          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Data tersimpan
          </div>
        </div>
      </div>

      {downloadMessage && (
        <div
          role="status"
          className={`mx-auto flex w-full max-w-[794px] items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            downloadMessage.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : downloadMessage.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {downloadMessage.tone === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : downloadMessage.tone === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <Lock className="h-4 w-4 shrink-0" />
          )}
          {downloadMessage.text}
        </div>
      )}

      {pendingResume && (
        <div
          role="status"
          className="mx-auto w-full max-w-[794px] rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Akses E-Book aktif. Lanjutkan unduhan yang tadi tertunda (
                {pendingResume.action === "download_pdf" ? "PDF" : "DOCX"}).
              </p>
            </div>
            <Button
              size="sm"
              onClick={resumePendingDownload}
              className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Lanjutkan Unduhan
            </Button>
          </div>
        </div>
      )}

      {/* Form kop identitas sekolah */}
      <div className="mx-auto w-full max-w-[794px] rounded-xl border bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setLetterheadOpen((open) => !open)}
          aria-expanded={letterheadOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <School className="h-4 w-4 text-emerald-600" />
            Kop Identitas Sekolah
          </span>
          {letterheadOpen
            ? <ChevronUp className="h-4 w-4 text-slate-400" />
            : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {letterheadOpen && (
          <div className="grid grid-cols-1 gap-4 border-t px-4 py-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lh-school">Nama Sekolah</Label>
              <Input
                id="lh-school"
                value={letterhead.school_name}
                onChange={(event) => updateLetterhead("school_name", event.target.value)}
                placeholder="Contoh: SMP Negeri 1 Bandung"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lh-headmaster">Kepala Sekolah</Label>
              <Input
                id="lh-headmaster"
                value={letterhead.headmaster}
                onChange={(event) => updateLetterhead("headmaster", event.target.value)}
                placeholder="Nama kepala sekolah"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="lh-address">Alamat</Label>
              <Textarea
                id="lh-address"
                value={letterhead.address}
                onChange={(event) => updateLetterhead("address", event.target.value)}
                placeholder="Jalan, nomor, kota, kode pos"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lh-phone">Telepon</Label>
              <Input
                id="lh-phone"
                value={letterhead.phone}
                onChange={(event) => updateLetterhead("phone", event.target.value)}
                placeholder="(022) 1234567"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lh-email">Email / Website</Label>
              <Input
                id="lh-email"
                value={letterhead.email}
                onChange={(event) => updateLetterhead("email", event.target.value)}
                placeholder="sekolah@example.sch.id"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lh-nip">NIP Kepala Sekolah</Label>
              <Input
                id="lh-nip"
                value={letterhead.nip}
                onChange={(event) => updateLetterhead("nip", event.target.value)}
                placeholder="NIP (opsional)"
              />
            </div>

            <p className="text-xs text-slate-500 md:col-span-2">
              Kop tercetak di unduhan. Tersimpan otomatis di perangkat ini.
            </p>
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="mx-auto w-full max-w-[794px] rounded-lg border border-dashed bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <FileQuestion className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Belum ada isi untuk dipratinjau</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            E-modul ini belum punya bab atau bagian. Kembali ke editor untuk menambahkan isi,
            lalu buka pratinjau lagi.
          </p>
          <div className="mt-6 flex justify-center">
            <Link to={editorPath}>
              <Button className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Kembali ke Editor
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <article className="mx-auto w-full max-w-[794px] rounded-lg border bg-white p-8 shadow-sm sm:p-12">
            <header className="border-b border-slate-200 pb-6 text-center">
              {hasSchoolLetterhead(letterhead) && (
                <div className="mb-6 border-b-4 border-double border-slate-800 pb-4">
                  <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">
                    {letterhead.school_name}
                  </h2>
                  {letterhead.address.trim() && (
                    <p className="mt-1 text-xs text-slate-600">{letterhead.address}</p>
                  )}
                  {[letterhead.phone, letterhead.email].some((value) => value.trim()) && (
                    <p className="text-xs text-slate-600">
                      {[letterhead.phone, letterhead.email]
                        .filter((value) => value.trim())
                        .join(" Ã‚Â· ")}
                    </p>
                  )}
                </div>
              )}

              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{draft.title}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {draft.subject} Ã‚Â· {draft.fase} {draft.kelas} Ã‚Â· Semester {draft.semester}
              </p>
            </header>

            {draft.topics.length > 0 && (
              <section className="border-b border-slate-200 py-5">
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Topik &amp; Capaian Pembelajaran
                </h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  {draft.topics.map((topic, index) => (
                    <li key={index}>
                      <span className="font-semibold text-slate-800">{topic.topik}</span>
                      {topic.capaian && <span className="block text-slate-500">{topic.capaian}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="pt-2">
              {detail.chapters.map((chapter) => (
                <section key={chapter.id} className="pt-6">
                  <h3 className="text-lg font-bold text-slate-900">{chapter.title}</h3>

                  {chapter.sections.map((section) => (
                    <div key={section.id} className="mt-4">
                      <h4 className="font-semibold text-slate-800">{section.title}</h4>
                      {section.content && (
                        <p className="mt-1 whitespace-pre-line text-sm leading-7 text-slate-600">
                          {section.content}
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>

            {(letterhead.headmaster.trim() || letterhead.nip.trim()) && (
              <div className="mt-10 flex justify-end">
                <div className="w-64 text-center text-sm text-slate-700">
                  <p>Kepala Sekolah</p>
                  <div className="h-16" />
                  <p className="font-semibold text-slate-900">{letterhead.headmaster || "Ã¢â‚¬Â¦"}</p>
                  {letterhead.nip.trim() && (
                    <p className="text-xs text-slate-500">NIP. {letterhead.nip}</p>
                  )}
                </div>
              </div>
            )}

            <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
              Soalify Ã‚Â· E-Modul {draft.subject}
            </footer>
          </article>

          <div className="mx-auto flex w-full max-w-[794px] items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <Printer className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Isi pratinjau dan unduhan berasal dari data tersimpan. Unduhan E-Modul tersedia
              untuk paket Premium Ã¢â‚¬â€ pengguna gratis diarahkan ke penawaran langganan.
            </p>
          </div>
        </>
      )}

      <EbookUpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        onViewPackages={() => {
          setUpgradeOpen(false);
          navigate(PLANS_PATH);
        }}
      />

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

      <p className="sr-only">
        <FileText className="h-4 w-4" aria-hidden="true" />
      </p>
    </div>
  );
}

/** Ubah base64 dari server menjadi unduhan berkas di browser. */
function triggerBase64Download(filename: string, mime: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
