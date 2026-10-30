-- Seed katalog paket langganan + manfaat E-Book.
--
-- Nilainya mengikuti definisi kode (`_shared/billing.ts` untuk harga/kredit/
-- durasi dan `_shared/ebook-plans.ts` untuk manfaat). Idempoten: aman dijalankan
-- ulang dan akan memperbarui baris yang sudah ada (on conflict do update).

insert into public.subscription_packages (
  id, name, description, price, credits, duration_months,
  tier, ebook_included, ebook_benefits, is_active, sort_order
)
values
  (
    'premium-6m',
    'Premium 6 Bulan',
    'Akses model premium dan kuota besar untuk satu semester.',
    149000,
    1000,
    6,
    'premium',
    true,
    $benefits$[
      {"key": "akses_emodul", "label": "Akses seluruh e-modul & bahan ajar"},
      {"key": "unduh_pdf", "label": "Unduh PDF tanpa batas"},
      {"key": "unduh_docx", "label": "Unduh DOCX tanpa batas"},
      {"key": "kop_sekolah", "label": "Kop identitas sekolah pada dokumen"},
      {"key": "pembaruan_materi", "label": "Pembaruan struktur & konten modul"}
    ]$benefits$::jsonb,
    true,
    1
  ),
  (
    'premium-12m',
    'Premium 12 Bulan',
    'Paket tahunan untuk sekolah/guru aktif dengan kuota lebih besar.',
    249000,
    2500,
    12,
    'premium',
    true,
    $benefits$[
      {"key": "akses_emodul", "label": "Akses seluruh e-modul & bahan ajar"},
      {"key": "unduh_pdf", "label": "Unduh PDF tanpa batas"},
      {"key": "unduh_docx", "label": "Unduh DOCX tanpa batas"},
      {"key": "kop_sekolah", "label": "Kop identitas sekolah pada dokumen"},
      {"key": "pembaruan_materi", "label": "Pembaruan struktur & konten modul"}
    ]$benefits$::jsonb,
    true,
    2
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  credits = excluded.credits,
  duration_months = excluded.duration_months,
  tier = excluded.tier,
  ebook_included = excluded.ebook_included,
  ebook_benefits = excluded.ebook_benefits,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;
