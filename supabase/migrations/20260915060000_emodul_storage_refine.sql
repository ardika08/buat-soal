-- Penyempurnaan penyimpanan e-modul untuk editor.
--
-- Tabel inti (`e_modul_sessions`, `e_modul_chapters`, `e_modul_sections`) dibuat
-- di migration 20260915000000_emodul_schema.sql. Di sini ditambahkan:
--   1. index (user_id, updated_at desc) untuk daftar "draf terakhir" berbasis
--      waktu sunting (bukan hanya waktu dibuat);
--   2. trigger yang menyentuh updated_at draf induk setiap kali bab/bagian
--      ditulis (insert/update) — urutan draf tetap benar apa pun jalur
--      penulisannya (RPC maupun admin). Penghapusan sudah disentuh oleh RPC
--      kelola struktur.

create index if not exists e_modul_sessions_user_updated_idx
  on public.e_modul_sessions(user_id, updated_at desc);

create or replace function public.touch_emodul_session_from_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emodul_id bigint;
begin
  if tg_table_name = 'e_modul_chapters' then
    v_emodul_id := new.e_modul_id;
  else
    select c.e_modul_id into v_emodul_id
    from public.e_modul_chapters c
    where c.id = new.chapter_id;
  end if;

  if v_emodul_id is not null then
    update public.e_modul_sessions set updated_at = now() where id = v_emodul_id;
  end if;

  return new;
end;
$$;

drop trigger if exists e_modul_chapters_touch_session on public.e_modul_chapters;
create trigger e_modul_chapters_touch_session
after insert or update on public.e_modul_chapters
for each row execute function public.touch_emodul_session_from_child();

drop trigger if exists e_modul_sections_touch_session on public.e_modul_sections;
create trigger e_modul_sections_touch_session
after insert or update on public.e_modul_sections
for each row execute function public.touch_emodul_session_from_child();

revoke all on function public.touch_emodul_session_from_child() from public, anon, authenticated;
