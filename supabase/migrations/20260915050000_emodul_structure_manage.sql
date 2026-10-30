-- Kelola struktur e-modul: susun ulang, tambah, dan hapus bab/bagian.
--
-- Unique (parent, order_number) dibuat DEFERRABLE INITIALLY DEFERRED agar
-- penyusunan ulang bisa menulis nomor baru dalam satu UPDATE tanpa bentrok
-- sementara; pelanggaran tetap ditolak saat commit.
--
-- Semua fungsi memverifikasi kepemilikan dan mengembalikan draf terbaru dalam
-- bentuk yang sama dengan endpoint ambil draf. Hanya service_role.

alter table public.e_modul_chapters
  drop constraint if exists e_modul_chapters_e_modul_id_order_number_key;
alter table public.e_modul_chapters
  add constraint e_modul_chapters_order_unique
  unique (e_modul_id, order_number) deferrable initially deferred;

alter table public.e_modul_sections
  drop constraint if exists e_modul_sections_chapter_id_order_number_key;
alter table public.e_modul_sections
  add constraint e_modul_sections_order_unique
  unique (chapter_id, order_number) deferrable initially deferred;

-- Bentuk draf yang dipakai semua endpoint editor.
create or replace function public.emodul_draft_json(p_emodul_id bigint)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'e_modul', to_jsonb(m.*),
    'chapters', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'order_number', c.order_number,
          'title', c.title,
          'sections', coalesce((
            select jsonb_agg(to_jsonb(s.*) order by s.order_number)
            from public.e_modul_sections s
            where s.chapter_id = c.id
          ), '[]'::jsonb)
        )
        order by c.order_number
      )
      from public.e_modul_chapters c
      where c.e_modul_id = m.id
    ), '[]'::jsonb)
  )
  from public.e_modul_sessions m
  where m.id = p_emodul_id;
$$;

-- Susun ulang bab sesuai urutan id yang dikirim (harus mencakup semua bab).
create or replace function public.reorder_emodul_chapters(
  p_user_id bigint,
  p_emodul_id bigint,
  p_chapter_ids bigint[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_provided integer;
begin
  if not exists (
    select 1 from public.e_modul_sessions where id = p_emodul_id and user_id = p_user_id
  ) then
    raise exception 'forbidden';
  end if;

  select count(*) into v_total from public.e_modul_chapters where e_modul_id = p_emodul_id;
  select count(distinct t.id) into v_provided
  from unnest(coalesce(p_chapter_ids, '{}'::bigint[])) as t(id)
  join public.e_modul_chapters c on c.id = t.id and c.e_modul_id = p_emodul_id;

  if v_total = 0
     or cardinality(coalesce(p_chapter_ids, '{}'::bigint[])) <> v_total
     or v_provided <> v_total then
    raise exception 'invalid_order';
  end if;

  update public.e_modul_chapters c
  set order_number = t.ord
  from (
    select id, ordinality as ord
    from unnest(p_chapter_ids) with ordinality as u(id, ordinality)
  ) t
  where c.id = t.id and c.e_modul_id = p_emodul_id;

  update public.e_modul_sessions set updated_at = now() where id = p_emodul_id;

  return public.emodul_draft_json(p_emodul_id);
end;
$$;

-- Susun ulang bagian di dalam satu bab (harus mencakup semua bagian bab itu).
create or replace function public.reorder_emodul_sections(
  p_user_id bigint,
  p_chapter_id bigint,
  p_section_ids bigint[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emodul_id bigint;
  v_total integer;
  v_provided integer;
begin
  select c.e_modul_id into v_emodul_id
  from public.e_modul_chapters c
  join public.e_modul_sessions m on m.id = c.e_modul_id
  where c.id = p_chapter_id and m.user_id = p_user_id;

  if v_emodul_id is null then
    raise exception 'forbidden';
  end if;

  select count(*) into v_total from public.e_modul_sections where chapter_id = p_chapter_id;
  select count(distinct t.id) into v_provided
  from unnest(coalesce(p_section_ids, '{}'::bigint[])) as t(id)
  join public.e_modul_sections s on s.id = t.id and s.chapter_id = p_chapter_id;

  if v_total = 0
     or cardinality(coalesce(p_section_ids, '{}'::bigint[])) <> v_total
     or v_provided <> v_total then
    raise exception 'invalid_order';
  end if;

  update public.e_modul_sections s
  set order_number = t.ord
  from (
    select id, ordinality as ord
    from unnest(p_section_ids) with ordinality as u(id, ordinality)
  ) t
  where s.id = t.id and s.chapter_id = p_chapter_id;

  update public.e_modul_sessions set updated_at = now() where id = v_emodul_id;

  return public.emodul_draft_json(v_emodul_id);
end;
$$;

-- Tambah bagian di akhir sebuah bab.
create or replace function public.add_emodul_section(
  p_user_id bigint,
  p_chapter_id bigint,
  p_kind text,
  p_title text,
  p_content text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emodul_id bigint;
begin
  select c.e_modul_id into v_emodul_id
  from public.e_modul_chapters c
  join public.e_modul_sessions m on m.id = c.e_modul_id
  where c.id = p_chapter_id and m.user_id = p_user_id;

  if v_emodul_id is null then
    raise exception 'forbidden';
  end if;

  if p_kind not in ('materi', 'latihan') then
    raise exception 'invalid_kind';
  end if;

  insert into public.e_modul_sections (chapter_id, order_number, kind, title, content)
  values (
    p_chapter_id,
    coalesce((select max(order_number) from public.e_modul_sections where chapter_id = p_chapter_id), 0) + 1,
    p_kind,
    coalesce(p_title, ''),
    coalesce(p_content, '')
  );

  update public.e_modul_sessions set updated_at = now() where id = v_emodul_id;

  return public.emodul_draft_json(v_emodul_id);
end;
$$;

-- Hapus satu bagian (minimal satu bagian harus tersisa) lalu rapatkan nomor.
create or replace function public.delete_emodul_section(
  p_user_id bigint,
  p_section_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chapter_id bigint;
  v_emodul_id bigint;
  v_count integer;
begin
  select s.chapter_id, c.e_modul_id into v_chapter_id, v_emodul_id
  from public.e_modul_sections s
  join public.e_modul_chapters c on c.id = s.chapter_id
  join public.e_modul_sessions m on m.id = c.e_modul_id
  where s.id = p_section_id and m.user_id = p_user_id;

  if v_chapter_id is null then
    raise exception 'not_found';
  end if;

  select count(*) into v_count from public.e_modul_sections where chapter_id = v_chapter_id;
  if v_count <= 1 then
    raise exception 'last_section';
  end if;

  delete from public.e_modul_sections where id = p_section_id;

  update public.e_modul_sections s
  set order_number = t.ord
  from (
    select id, row_number() over (order by order_number) as ord
    from public.e_modul_sections
    where chapter_id = v_chapter_id
  ) t
  where s.id = t.id;

  update public.e_modul_sessions set updated_at = now() where id = v_emodul_id;

  return public.emodul_draft_json(v_emodul_id);
end;
$$;

-- Tambah bab di akhir e-modul.
create or replace function public.add_emodul_chapter(
  p_user_id bigint,
  p_emodul_id bigint,
  p_title text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.e_modul_sessions where id = p_emodul_id and user_id = p_user_id
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.e_modul_chapters (e_modul_id, order_number, title)
  values (
    p_emodul_id,
    coalesce((select max(order_number) from public.e_modul_chapters where e_modul_id = p_emodul_id), 0) + 1,
    coalesce(p_title, '')
  );

  update public.e_modul_sessions set updated_at = now() where id = p_emodul_id;

  return public.emodul_draft_json(p_emodul_id);
end;
$$;

-- Hapus satu bab (minimal satu bab harus tersisa) lalu rapatkan nomor.
create or replace function public.delete_emodul_chapter(
  p_user_id bigint,
  p_chapter_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emodul_id bigint;
  v_count integer;
begin
  select c.e_modul_id into v_emodul_id
  from public.e_modul_chapters c
  join public.e_modul_sessions m on m.id = c.e_modul_id
  where c.id = p_chapter_id and m.user_id = p_user_id;

  if v_emodul_id is null then
    raise exception 'not_found';
  end if;

  select count(*) into v_count from public.e_modul_chapters where e_modul_id = v_emodul_id;
  if v_count <= 1 then
    raise exception 'last_chapter';
  end if;

  delete from public.e_modul_chapters where id = p_chapter_id;

  update public.e_modul_chapters c
  set order_number = t.ord
  from (
    select id, row_number() over (order by order_number) as ord
    from public.e_modul_chapters
    where e_modul_id = v_emodul_id
  ) t
  where c.id = t.id;

  update public.e_modul_sessions set updated_at = now() where id = v_emodul_id;

  return public.emodul_draft_json(v_emodul_id);
end;
$$;

-- Hanya service_role (Edge Function memverifikasi sesi pengguna).
revoke all on function public.emodul_draft_json(bigint) from public, anon, authenticated;
revoke all on function public.reorder_emodul_chapters(bigint, bigint, bigint[]) from public, anon, authenticated;
revoke all on function public.reorder_emodul_sections(bigint, bigint, bigint[]) from public, anon, authenticated;
revoke all on function public.add_emodul_section(bigint, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.delete_emodul_section(bigint, bigint) from public, anon, authenticated;
revoke all on function public.add_emodul_chapter(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.delete_emodul_chapter(bigint, bigint) from public, anon, authenticated;

grant execute on function public.reorder_emodul_chapters(bigint, bigint, bigint[]) to service_role;
grant execute on function public.reorder_emodul_sections(bigint, bigint, bigint[]) to service_role;
grant execute on function public.add_emodul_section(bigint, bigint, text, text, text) to service_role;
grant execute on function public.delete_emodul_section(bigint, bigint) to service_role;
grant execute on function public.add_emodul_chapter(bigint, bigint, text) to service_role;
grant execute on function public.delete_emodul_chapter(bigint, bigint) to service_role;
