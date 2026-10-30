-- Menyimpan perubahan draf e-modul yang sudah ada untuk editor.
--
-- Berbeda dari `save_emodul` (membuat draf baru), fungsi ini MEMPERBARUI draf
-- milik pengguna: metadata sesi, judul bab, serta judul & isi bagian. Baris
-- dengan id yang tidak dikenal/di luar draf ini diabaikan — penambahan,
-- penghapusan, dan penyusunan ulang bagian ditangani fungsi tersendiri.
--
-- Hanya service_role yang boleh memanggil (Edge Function memverifikasi sesi).

create or replace function public.save_emodul_draft(
  p_user_id bigint,
  p_emodul_id bigint,
  p_emodul jsonb,
  p_chapters jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chapter jsonb;
  v_section jsonb;
  v_session jsonb;
  v_chapters jsonb;
begin
  if not exists (
    select 1
    from public.e_modul_sessions
    where id = p_emodul_id and user_id = p_user_id
  ) then
    raise exception 'forbidden';
  end if;

  -- 1. Metadata sesi (nilai yang tidak dikirim dibiarkan apa adanya).
  update public.e_modul_sessions
  set title = coalesce(nullif(btrim(p_emodul->>'title'), ''), title),
      topics = coalesce(p_emodul->'topics', topics),
      fase = coalesce(p_emodul->>'fase', fase),
      kelas = coalesce(p_emodul->>'kelas', kelas),
      subject = coalesce(p_emodul->>'subject', subject),
      semester = coalesce(p_emodul->>'semester', semester),
      status = coalesce(p_emodul->>'status', status)
  where id = p_emodul_id;

  -- 2. Judul bab & isi bagian yang sudah ada (hanya milik draf ini).
  for v_chapter in
    select value from jsonb_array_elements(coalesce(p_chapters, '[]'::jsonb))
  loop
    if (v_chapter->>'id') ~ '^[0-9]+$' then
      update public.e_modul_chapters
      set title = coalesce(v_chapter->>'title', title)
      where id = (v_chapter->>'id')::bigint and e_modul_id = p_emodul_id;
    end if;

    for v_section in
      select value from jsonb_array_elements(coalesce(v_chapter->'sections', '[]'::jsonb))
    loop
      if (v_section->>'id') ~ '^[0-9]+$' then
        update public.e_modul_sections s
        set title = coalesce(v_section->>'title', s.title),
            content = coalesce(v_section->>'content', s.content)
        from public.e_modul_chapters c
        where s.chapter_id = c.id
          and c.e_modul_id = p_emodul_id
          and s.id = (v_section->>'id')::bigint;
      end if;
    end loop;
  end loop;

  -- 3. Kembalikan draf terbaru (bentuk sama dengan endpoint ambil).
  select to_jsonb(m.*) into v_session
  from public.e_modul_sessions m
  where m.id = p_emodul_id;

  select jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'order_number', c.order_number,
      'title', c.title,
      'sections', coalesce(
        (
          select jsonb_agg(to_jsonb(s.*) order by s.order_number)
          from public.e_modul_sections s
          where s.chapter_id = c.id
        ),
        '[]'::jsonb
      )
    )
    order by c.order_number
  )
  into v_chapters
  from public.e_modul_chapters c
  where c.e_modul_id = p_emodul_id;

  return jsonb_build_object(
    'e_modul', v_session,
    'chapters', coalesce(v_chapters, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.save_emodul_draft(bigint, bigint, jsonb, jsonb) from public;
revoke all on function public.save_emodul_draft(bigint, bigint, jsonb, jsonb) from anon, authenticated;
grant execute on function public.save_emodul_draft(bigint, bigint, jsonb, jsonb) to service_role;
