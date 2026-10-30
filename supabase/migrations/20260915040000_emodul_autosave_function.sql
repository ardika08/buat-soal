-- Simpan otomatis satu bagian e-modul (dipakai editor saat guru mengetik).
--
-- Memperbarui judul/isi satu bagian milik pengguna, menyentuh updated_at draf
-- induknya agar urutan "draf terakhir" tetap segar, lalu mengembalikan bagian
-- yang tersimpan. Hanya service_role yang boleh memanggil.

create or replace function public.autosave_emodul_section(
  p_user_id bigint,
  p_section_id bigint,
  p_title text,
  p_content text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section public.e_modul_sections;
  v_emodul_id bigint;
begin
  select s.* into v_section
  from public.e_modul_sections s
  join public.e_modul_chapters c on c.id = s.chapter_id
  join public.e_modul_sessions m on m.id = c.e_modul_id
  where s.id = p_section_id and m.user_id = p_user_id;

  if v_section.id is null then
    raise exception 'not_found';
  end if;

  select c.e_modul_id into v_emodul_id
  from public.e_modul_chapters c
  where c.id = v_section.chapter_id;

  update public.e_modul_sections
  set title = coalesce(p_title, title),
      content = coalesce(p_content, content)
  where id = p_section_id
  returning * into v_section;

  -- Sentuh draf induk supaya updated_at-nya ikut bergerak.
  update public.e_modul_sessions
  set updated_at = now()
  where id = v_emodul_id;

  return jsonb_build_object(
    'section_id', v_section.id,
    'chapter_id', v_section.chapter_id,
    'order_number', v_section.order_number,
    'kind', v_section.kind,
    'title', v_section.title,
    'content', v_section.content,
    'updated_at', v_section.updated_at
  );
end;
$$;

revoke all on function public.autosave_emodul_section(bigint, bigint, text, text) from public;
revoke all on function public.autosave_emodul_section(bigint, bigint, text, text) from anon, authenticated;
grant execute on function public.autosave_emodul_section(bigint, bigint, text, text) to service_role;
