-- Pembuatan e-modul transaksional: simpan sesi + bab + bagian, potong kredit,
-- dan catat transaksi secara atomik. Bila salah satu langkah gagal, semuanya
-- rollback — tidak ada sesi setengah jadi dan kredit tidak hilang.

create or replace function public.create_emodul_with_credits(
  p_user_id bigint,
  p_emodul jsonb,
  p_chapters jsonb,
  p_required_credits integer,
  p_description text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id bigint;
  v_session jsonb;
  v_chapters jsonb;
  v_new_balance integer;
  v_required integer := greatest(coalesce(p_required_credits, 0), 0);
  v_chapter jsonb;
  v_chapter_id bigint;
  v_fallback_order integer := 0;
begin
  -- 1. Simpan sesi e-modul
  insert into public.e_modul_sessions (
    user_id, title, topics, fase, kelas, subject, semester,
    chapters_target, sub_chapters_target, exercise_share, status, credits_consumed
  ) values (
    p_user_id,
    coalesce(nullif(btrim(p_emodul->>'title'), ''), 'E-Modul Baru'),
    coalesce(p_emodul->'topics', '[]'::jsonb),
    coalesce(p_emodul->>'fase', ''),
    coalesce(p_emodul->>'kelas', ''),
    coalesce(p_emodul->>'subject', ''),
    coalesce(p_emodul->>'semester', 'Ganjil'),
    coalesce((p_emodul->>'chapters_target')::smallint, 4),
    coalesce((p_emodul->>'sub_chapters_target')::smallint, 2),
    coalesce((p_emodul->>'exercise_share')::smallint, 30),
    coalesce(p_emodul->>'status', 'draft'),
    v_required
  )
  returning id into v_session_id;

  -- 2. Simpan bab + bagian (urutan mengikuti payload)
  for v_chapter in
    select value from jsonb_array_elements(coalesce(p_chapters, '[]'::jsonb))
  loop
    v_fallback_order := v_fallback_order + 1;

    insert into public.e_modul_chapters (e_modul_id, order_number, title)
    values (
      v_session_id,
      coalesce((v_chapter->>'order_number')::integer, v_fallback_order),
      coalesce(v_chapter->>'title', '')
    )
    returning id into v_chapter_id;

    insert into public.e_modul_sections (chapter_id, order_number, kind, title, content)
    select
      v_chapter_id,
      coalesce((s.val->>'order_number')::integer, s.ord::integer),
      s.val->>'kind',
      coalesce(s.val->>'title', ''),
      coalesce(s.val->>'content', '')
    from jsonb_array_elements(coalesce(v_chapter->'sections', '[]'::jsonb)) with ordinality as s(val, ord);
  end loop;

  if not exists (select 1 from public.e_modul_chapters where e_modul_id = v_session_id) then
    raise exception 'chapters_insert_failed';
  end if;

  -- 3. Potong kredit secara atomik (aman balapan)
  update public.profiles
  set credits_balance = credits_balance - v_required
  where id = p_user_id and credits_balance >= v_required
  returning credits_balance into v_new_balance;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  -- 4. Catat transaksi kredit
  if v_required > 0 then
    insert into public.credit_transactions (user_id, type, amount, description)
    values (p_user_id, 'deduction', -v_required, p_description);
  end if;

  -- 5. Kembalikan sesi beserta bab/bagian yang baru dibuat
  select to_jsonb(m.*) into v_session
  from public.e_modul_sessions m
  where m.id = v_session_id;

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
  where c.e_modul_id = v_session_id;

  return jsonb_build_object(
    'e_modul', v_session,
    'chapters', coalesce(v_chapters, '[]'::jsonb),
    'credits_remaining', v_new_balance
  );
end;
$$;

-- RPC sensitif hanya boleh dipanggil service role (Edge Function).
revoke all on function public.create_emodul_with_credits(bigint, jsonb, jsonb, integer, text) from public;
revoke all on function public.create_emodul_with_credits(bigint, jsonb, jsonb, integer, text) from anon, authenticated;
grant execute on function public.create_emodul_with_credits(bigint, jsonb, jsonb, integer, text) to service_role;
