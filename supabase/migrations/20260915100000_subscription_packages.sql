-- Katalog paket langganan beserta fitur E-Book.
--
-- Sebelumnya paket hanya berupa konstanta di kode (`_shared/billing.ts`). Tabel
-- ini menyiapkan sumber data paket + manfaat E-Book agar bisa di-seed dan
-- dikelola tanpa deploy. Katalog boleh dibaca pengguna terautentikasi (baris
-- aktif); mutasi hanya lewat service_role.

create table if not exists public.subscription_packages (
  id text primary key,
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  credits integer not null default 0 check (credits >= 0),
  duration_months integer check (duration_months is null or duration_months > 0),
  tier text not null default 'premium' check (tier in ('free', 'premium')),
  ebook_included boolean not null default false,
  -- [{ key, label }] — manfaat E-Book yang disertakan paket ini.
  ebook_benefits jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_packages_active_idx
  on public.subscription_packages(is_active, sort_order);

alter table public.subscription_packages enable row level security;

drop policy if exists "Authenticated users can read active packages" on public.subscription_packages;
create policy "Authenticated users can read active packages"
on public.subscription_packages for select to authenticated
using (is_active);

revoke insert, update, delete on public.subscription_packages from authenticated, anon;
grant select on public.subscription_packages to authenticated;
revoke select on public.subscription_packages from anon;

drop trigger if exists subscription_packages_set_updated_at on public.subscription_packages;
create trigger subscription_packages_set_updated_at
before update on public.subscription_packages
for each row execute function public.set_updated_at();
