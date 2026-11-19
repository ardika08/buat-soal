import { Link } from "react-router-dom";
import { ArrowRight, BookOpenText, Check, ClipboardList, Mail, MapPin, Phone } from "lucide-react";


const plans = [
  {
    name: "Premium 6 Bulan",
    price: "Rp149.000",
    detail: "1.000 kredit · akses 6 bulan",
    description: "Untuk guru yang membutuhkan bantuan rutin menyusun soal dan bahan ajar selama satu semester.",
    features: ["Akses model AI premium", "1.000 kredit", "Akses e-modul dan bahan ajar", "Ekspor PDF dan DOCX"],
  },
  {
    name: "Premium 12 Bulan",
    price: "Rp249.000",
    detail: "2.500 kredit · akses 12 bulan",
    description: "Paket tahunan dengan kuota lebih besar untuk guru dan sekolah yang aktif.",
    features: ["Akses model AI premium", "2.500 kredit", "Akses e-modul dan bahan ajar", "Ekspor PDF dan DOCX"],
  },
];

export default function PublicHome() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#beranda" className="text-xl font-extrabold tracking-tight text-indigo-700">GuruKit</a>
          <nav className="flex items-center gap-3">
            <a href="#paket" className="hidden text-sm font-medium text-slate-600 hover:text-indigo-700 sm:inline">Paket</a>
            <a href="#kontak" className="hidden text-sm font-medium text-slate-600 hover:text-indigo-700 sm:inline">Kontak</a>
            <Link to="/login" className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Masuk</Link>
            <Link to="/login" className="inline-flex h-9 items-center justify-center rounded-full bg-indigo-700 px-4 text-sm font-medium text-white hover:bg-indigo-800">Daftar gratis</Link>
          </nav>
        </div>
      </header>

      <section id="beranda" className="bg-gradient-to-br from-indigo-50 via-white to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[1.15fr_0.85fr] md:items-center md:py-28">
          <div>
            <span className="inline-flex rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-800">Platform produktivitas guru</span>
            <h1 className="mt-5 max-w-2xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">Persiapkan pembelajaran dengan lebih praktis</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">GuruKit membantu guru menyusun paket soal dan e-modul berbantuan AI, mengelola bank soal, serta mengunduh bahan ajar dalam format siap digunakan.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="inline-flex h-11 items-center justify-center rounded-full bg-indigo-700 px-6 text-sm font-semibold text-white hover:bg-indigo-800">Mulai gratis <ArrowRight className="ml-2 h-4 w-4" /></Link>
              <a href="#paket" className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50">Lihat paket langganan</a>
            </div>
            <p className="mt-4 text-sm text-slate-500">Pendaftaran dan login menggunakan akun Google. Pengguna baru mendapat 100 kredit gratis.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureCard icon={<ClipboardList className="h-5 w-5" />} title="Generator soal" text="Buat soal sesuai mata pelajaran, fase, tujuan, dan format yang dibutuhkan." />
            <FeatureCard icon={<BookOpenText className="h-5 w-5" />} title="E-modul pembelajaran" text="Susun bahan ajar per bab dengan struktur yang dapat ditinjau dan diedit." />
            <div className="rounded-2xl border border-indigo-100 bg-indigo-700 p-5 text-white sm:col-span-2">
              <p className="text-sm font-medium text-indigo-100">Dirancang untuk alur kerja guru</p>
              <p className="mt-2 text-xl font-bold">Dari perencanaan materi sampai dokumen siap dibagikan.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="produk" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-indigo-700">Produk GuruKit</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Alat bantu untuk menyiapkan pembelajaran</h2>
          <p className="mt-3 leading-7 text-slate-600">Gunakan fitur dasar secara gratis, atau pilih langganan Premium untuk kuota kredit lebih besar dan akses e-modul.</p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <FeatureCard icon={<ClipboardList className="h-5 w-5" />} title="Pembuatan dan bank soal" text="Generate paket soal berdasarkan topik dan tujuan pembelajaran, simpan soal pilihan, lalu tinjau sebelum mengunduh." />
          <FeatureCard icon={<BookOpenText className="h-5 w-5" />} title="E-modul dan bahan ajar" text="Buat e-modul terstruktur per bab, tinjau hasilnya, dan ekspor menjadi PDF atau DOCX sesuai paket." />
        </div>
      </section>

      <section id="paket" className="bg-slate-50 px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-indigo-700">Harga langganan</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Pilih paket sesuai kebutuhan</h2>
            <p className="mt-3 text-slate-600">Pembayaran dilakukan melalui checkout setelah Anda masuk atau membuat akun.</p>
          </div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">Paket Dasar</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Untuk mencoba fitur pembuatan soal dan mengelola materi secara gratis.</p>
              <p className="mt-5 text-3xl font-extrabold">Gratis</p>
              <ul className="mt-5 flex-1 space-y-3 text-sm text-slate-700">
                <PlanFeature>100 kredit awal untuk pengguna baru</PlanFeature>
                <PlanFeature>Pembuatan soal berbantuan AI</PlanFeature>
                <PlanFeature>Bank soal dan riwayat ujian</PlanFeature>
              </ul>
              <Link to="/login" className="mt-7 inline-flex h-9 w-full items-center justify-center rounded-full border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">Daftar gratis</Link>
            </article>
            {plans.map((plan, index) => (
              <article key={plan.name} className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${index === 0 ? "border-indigo-300 ring-1 ring-indigo-200" : "border-slate-200"}`}>
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{plan.description}</p>
                <p className="mt-5 text-3xl font-extrabold">{plan.price}</p>
                <p className="mt-1 text-sm font-medium text-indigo-700">{plan.detail}</p>
                <ul className="mt-5 flex-1 space-y-3 text-sm text-slate-700">
                  {plan.features.map((feature) => <PlanFeature key={feature}>{feature}</PlanFeature>)}
                </ul>
                <Link to="/login" className="mt-7 inline-flex h-9 w-full items-center justify-center rounded-full bg-indigo-700 text-sm font-medium text-white hover:bg-indigo-800">Masuk untuk membeli</Link>
              </article>
            ))}
          </div>
          <p className="mt-5 text-center text-xs text-slate-500">Harga dalam Rupiah. Paket berbayar aktif setelah pembayaran berhasil diverifikasi.</p>
        </div>
      </section>

      <section id="kontak" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-indigo-700">Bantuan pelanggan</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Hubungi tim GuruKit</h2>
            <p className="mt-3 leading-7 text-slate-600">Hubungi kami jika Anda membutuhkan bantuan terkait akun, paket langganan, atau penggunaan layanan.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <ContactCard icon={<Mail className="h-5 w-5" />} label="Email" value="info@gurukit.web.id" href="mailto:info@gurukit.web.id" />
            <ContactCard icon={<Phone className="h-5 w-5" />} label="Telepon" value="081995080508" href="tel:081995080508" />
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:col-span-1">
              <MapPin className="h-5 w-5 text-indigo-700" />
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Alamat usaha</p>
              <p className="mt-2 text-sm leading-6 text-slate-800">Jl. Kediri Raya No. 2 RT 55 RW 16, Kel. Uwung Jaya, Kec. Cibodas, Kota Tangerang, Banten</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} GuruKit</span>
          <span>Platform produktivitas guru untuk soal dan bahan ajar.</span>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">{icon}</div>
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </article>
  );
}

function PlanFeature({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><span>{children}</span></li>;
}

function ContactCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href: string }) {
  return (
    <a href={href} className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm">
      <div className="text-indigo-700">{icon}</div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-800">{value}</p>
    </a>
  );
}
