-- Konfigurasi kop identitas sekolah & tata letak dokumen e-modul (per pengguna).
--
-- Dipakai saat pratinjau/unduh. Klien hanya boleh membaca miliknya; mutasi lewat
-- RPC `save_emodul_settings` (hanya service_role). `layout` disimpan sebagai
-- jsonb supaya opsi tata letak bisa ditambah tanpa migration baru.

create table if not exists public.emodul_settings (
  user_id bigint primary key references public.profiles(id) on delete cascade,
  school_name text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  headmaster text not null default '',
  nip text not null default '',
  layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.emodul_settings enable row level security;

drop policy if exists "Users can read own emodul settings" on public.emodul_settings;
create policy "Users can read own emodul settings"
on public.emodul_settings for select to authenticated
using (user_id in (select id from public.profiles where auth_user_id = auth.uid()));

revoke insert, update, delete on public.emodul_settings from authenticated, anon;
grant select on public.emodul_settings to authenticated;
revoke select on public.emodul_settings from anon;

drop trigger if exists emodul_settings_set_updated_at on public.emodul_settings;
create trigger emodul_settings_set_updated_at
before update on public.emodul_settings
for each row execute function public.set_updated_at();

create or replace function public.get_emodul_settings(p_user_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select to_jsonb(s.*) from public.emodul_settings s where s.user_id = p_user_id),
    jsonb_build_object(
      'user_id', p_user_id,
      'school_name', '',
      'address', '',
      'phone', '',
      'email', '',
      'headmaster', '',
      'nip', '',
      'layout', '{}'::jsonb,
      'created_at', null,
      'updated_at', null
    )
  );
$$;

create or replace function public.save_emodul_settings(p_user_id bigint, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layout jsonb := case
    when jsonb_typeof(p_settings->'layout') = 'object' then p_settings->'layout'
    else '{}'::jsonb
  end;
  v_settings jsonb;
begin
  insert into public.emodul_settings (
    user_id, school_name, address, phone, email, headmaster, nip, layout
  ) values (
    p_user_id,
    coalesce(p_settings->>'school_name', ''),
    coalesce(p_settings->>'address', ''),
    coalesce(p_settings->>'phone', ''),
    coalesce(p_settings->>'email', ''),
    coalesce(p_settings->>'headmaster', ''),
    coalesce(p_settings->>'nip', ''),
    v_layout
  )
  on conflict (user_id) do update set
    school_name = excluded.school_name,
    address = excluded.address,
    phone = excluded.phone,
    email = excluded.email,
    headmaster = excluded.headmaster,
    nip = excluded.nip,
    layout = excluded.layout
  returning to_jsonb(emodul_settings) into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.get_emodul_settings(bigint) from public, anon, authenticated;
revoke all on function public.save_emodul_settings(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.get_emodul_settings(bigint) to service_role;
grant execute on function public.save_emodul_settings(bigint, jsonb) to service_role;
