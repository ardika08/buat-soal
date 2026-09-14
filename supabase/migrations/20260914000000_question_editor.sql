-- Editor soal lengkap: pembahasan, tambah/hapus/urutkan soal, dan regenerasi.
--
-- Semua mutasi klien melewati fungsi SECURITY DEFINER yang memverifikasi
-- kepemilikan lewat auth.uid(), bukan mempercayai id dari klien. Hak UPDATE
-- langsung dicabut supaya validasi server tidak bisa dilewati.

-- ---------------------------------------------------------------------------
-- 1. Kolom pembahasan
-- ---------------------------------------------------------------------------

alter table public.questions
  add column if not exists explanation text;

revoke insert, update, delete on public.questions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. Helper: id profil pemilik sesi ujian tertentu (null bila bukan milik pemanggil)
-- ---------------------------------------------------------------------------

create or replace function public.owned_exam_profile_id(p_exam_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select e.user_id
  from public.exam_sessions e
  join public.profiles p on p.id = e.user_id
  where e.id = p_exam_id
    and p.auth_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 3. Update satu soal dengan validasi server
-- ---------------------------------------------------------------------------

create or replace function public.update_exam_question(
  p_exam_id bigint,
  p_question_id bigint,
  p_question jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner bigint;
  v_options jsonb;
  v_answer text;
  v_updated jsonb;
begin
  v_owner := public.owned_exam_profile_id(p_exam_id);
  if v_owner is null then raise exception 'forbidden'; end if;

  if not exists (
    select 1 from public.questions where id = p_question_id and exam_session_id = p_exam_id
  ) then raise exception 'not_found'; end if;

  if btrim(coalesce(p_question->>'question_content', '')) = '' then
    raise exception 'question_required';
  end if;
  if btrim(coalesce(p_question->>'correct_answer', '')) = '' then
    raise exception 'answer_required';
  end if;

  v_options := p_question->'options';
  v_answer := p_question->>'correct_answer';
  if v_options is not null and jsonb_typeof(v_options) = 'object' then
    if (select count(*) from jsonb_object_keys(v_options)) < 2 then
      raise exception 'minimum_options';
    end if;
    if not (v_options ? v_answer) then
      raise exception 'invalid_answer_key';
    end if;
  end if;

  update public.questions
    set question_type = coalesce(nullif(p_question->>'question_type', ''), question_type),
        cognitive_level = nullif(p_question->>'cognitive_level', ''),
        difficulty = nullif(p_question->>'difficulty', ''),
        question_content = p_question->>'question_content',
        options = case when jsonb_typeof(v_options) = 'object' then v_options else null end,
        correct_answer = v_answer,
        explanation = nullif(p_question->>'explanation', ''),
        illustration_prompt = nullif(p_question->>'illustration_prompt', ''),
        illustration_image = nullif(p_question->>'illustration_image', '')
    where id = p_question_id and exam_session_id = p_exam_id
    returning to_jsonb(questions.*) into v_updated;

  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tambah satu soal ke sesi ujian
-- ---------------------------------------------------------------------------
-- Soal baru disisipkan pada posisi p_after_order + 1; nomor soal sesudahnya
-- digeser +1 supaya urutan tetap rapat. Bila p_after_order null/<=0, ditaruh
-- di akhir.

create or replace function public.add_exam_question(
  p_exam_id bigint,
  p_after_order integer,
  p_question jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner bigint;
  v_max integer;
  v_pos integer;
  v_new jsonb;
begin
  v_owner := public.owned_exam_profile_id(p_exam_id);
  if v_owner is null then
    raise exception 'forbidden';
  end if;

  if btrim(coalesce(p_question->>'question_content', '')) = '' then
    raise exception 'question_required';
  end if;
  if btrim(coalesce(p_question->>'correct_answer', '')) = '' then
    raise exception 'answer_required';
  end if;
  if jsonb_typeof(p_question->'options') = 'object' then
    if (select count(*) from jsonb_object_keys(p_question->'options')) < 2 then
      raise exception 'minimum_options';
    end if;
    if not ((p_question->'options') ? (p_question->>'correct_answer')) then
      raise exception 'invalid_answer_key';
    end if;
  end if;

  select coalesce(max(order_number), 0) into v_max
  from public.questions where exam_session_id = p_exam_id;

  if p_after_order is null or p_after_order < 0 or p_after_order >= v_max then
    v_pos := v_max + 1;
  else
    v_pos := p_after_order + 1;
    update public.questions
      set order_number = order_number + 1
      where exam_session_id = p_exam_id and order_number >= v_pos;
  end if;

  insert into public.questions (
    exam_session_id, order_number, question_type, cognitive_level,
    difficulty, question_content, options, correct_answer, explanation,
    illustration_prompt, illustration_image
  )
  values (
    p_exam_id,
    v_pos,
    coalesce(p_question->>'question_type', 'Pilihan Ganda'),
    nullif(p_question->>'cognitive_level', ''),
    nullif(p_question->>'difficulty', ''),
    coalesce(p_question->>'question_content', ''),
    case when jsonb_typeof(p_question->'options') = 'object'
      then p_question->'options' else null end,
    coalesce(p_question->>'correct_answer', ''),
    nullif(p_question->>'explanation', ''),
    nullif(p_question->>'illustration_prompt', ''),
    nullif(p_question->>'illustration_image', '')
  )
  returning to_jsonb(questions.*) into v_new;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Hapus satu soal, lalu rapatkan nomor urut
-- ---------------------------------------------------------------------------
-- Menolak menghapus soal terakhir: sebuah ujian tidak boleh kosong.

create or replace function public.delete_exam_question(
  p_exam_id bigint,
  p_question_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner bigint;
  v_count integer;
  v_order integer;
begin
  v_owner := public.owned_exam_profile_id(p_exam_id);
  if v_owner is null then
    raise exception 'forbidden';
  end if;

  select count(*) into v_count
  from public.questions where exam_session_id = p_exam_id;

  if v_count <= 1 then
    raise exception 'last_question';
  end if;

  select order_number into v_order
  from public.questions
  where id = p_question_id and exam_session_id = p_exam_id;

  if v_order is null then
    raise exception 'not_found';
  end if;

  delete from public.questions
  where id = p_question_id and exam_session_id = p_exam_id;

  update public.questions
    set order_number = order_number - 1
    where exam_session_id = p_exam_id and order_number > v_order;

  return jsonb_build_object('deleted_id', p_question_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Urutkan ulang seluruh soal
-- ---------------------------------------------------------------------------
-- p_ordered_ids adalah array id soal dalam urutan baru. Wajib berisi seluruh
-- (dan hanya) soal milik sesi ini — mencegah nomor bolong/duplikat. Dua langkah
-- (offset besar dulu, lalu 1..n) menghindari tabrakan indeks unik sementara.

create or replace function public.reorder_exam_questions(
  p_exam_id bigint,
  p_ordered_ids bigint[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner bigint;
  v_total integer;
  v_provided integer;
begin
  v_owner := public.owned_exam_profile_id(p_exam_id);
  if v_owner is null then
    raise exception 'forbidden';
  end if;

  select count(*) into v_total
  from public.questions where exam_session_id = p_exam_id;

  select count(distinct id) into v_provided
  from unnest(p_ordered_ids) as t(id)
  where id in (select id from public.questions where exam_session_id = p_exam_id);

  if v_provided <> v_total or array_length(p_ordered_ids, 1) <> v_total then
    raise exception 'order_mismatch';
  end if;

  update public.questions
    set order_number = order_number + 100000
    where exam_session_id = p_exam_id;

  update public.questions q
    set order_number = t.rn::integer
    from (
      select id, rn
      from unnest(p_ordered_ids) with ordinality as u(id, rn)
    ) t
    where q.id = t.id and q.exam_session_id = p_exam_id;

  return jsonb_build_object(
    'questions',
    (select coalesce(jsonb_agg(to_jsonb(q) order by q.order_number), '[]'::jsonb)
     from public.questions q where q.exam_session_id = p_exam_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Ganti isi satu soal + potong kredit atomik (dipakai edge regenerasi)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, hanya service_role. Idempoten lewat idempotency_key pada
-- ledger: klik ganda tidak memotong dua kali. order_number dipertahankan.

create or replace function public.regenerate_question_with_credit(
  p_user_id bigint,
  p_question_id bigint,
  p_question jsonb,
  p_cost integer,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id bigint;
  v_new_balance integer;
  v_updated jsonb;
begin
  -- Idempotensi: bila kunci sudah pernah dipakai, kembalikan soal apa adanya
  -- tanpa memotong kredit lagi.
  if p_idempotency_key is not null and exists (
    select 1 from public.credit_transactions where idempotency_key = p_idempotency_key
  ) then
    select to_jsonb(q.*) into v_updated from public.questions q where q.id = p_question_id;
    select credits_balance into v_new_balance from public.profiles where id = p_user_id;
    return jsonb_build_object('question', v_updated, 'credits_remaining', v_new_balance, 'reused', true);
  end if;

  -- Pastikan soal memang milik user ini.
  select e.id into v_exam_id
  from public.questions q
  join public.exam_sessions e on e.id = q.exam_session_id
  where q.id = p_question_id and e.user_id = p_user_id;

  if v_exam_id is null then
    raise exception 'forbidden';
  end if;

  -- Potong kredit (aman terhadap balapan).
  update public.profiles
    set credits_balance = credits_balance - p_cost
    where id = p_user_id and credits_balance >= p_cost
    returning credits_balance into v_new_balance;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  insert into public.credit_transactions (
    user_id, type, amount, description, idempotency_key, reference_type, reference_id
  ) values (
    p_user_id, 'deduction', -p_cost, 'Regenerasi soal',
    p_idempotency_key, 'question_regenerate', p_question_id::text
  );

  update public.questions
    set question_type = coalesce(p_question->>'question_type', question_type),
        cognitive_level = coalesce(nullif(p_question->>'cognitive_level', ''), cognitive_level),
        difficulty = coalesce(nullif(p_question->>'difficulty', ''), difficulty),
        question_content = coalesce(p_question->>'question_content', question_content),
        options = case when p_question ? 'options'
          then (case when jsonb_typeof(p_question->'options') = 'object' then p_question->'options' else null end)
          else options end,
        correct_answer = coalesce(p_question->>'correct_answer', correct_answer),
        explanation = case when p_question ? 'explanation'
          then nullif(p_question->>'explanation', '') else explanation end,
        illustration_prompt = case when p_question ? 'illustration_prompt'
          then nullif(p_question->>'illustration_prompt', '') else illustration_prompt end,
        illustration_image = case when p_question ? 'illustration_image'
          then nullif(p_question->>'illustration_image', '') else illustration_image end
    where id = p_question_id
    returning to_jsonb(questions.*) into v_updated;

  return jsonb_build_object('question', v_updated, 'credits_remaining', v_new_balance, 'reused', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Hak akses fungsi
-- ---------------------------------------------------------------------------

revoke all on function public.owned_exam_profile_id(bigint) from public, anon;
revoke all on function public.update_exam_question(bigint, bigint, jsonb) from public, anon;
revoke all on function public.add_exam_question(bigint, integer, jsonb) from public, anon;
revoke all on function public.delete_exam_question(bigint, bigint) from public, anon;
revoke all on function public.reorder_exam_questions(bigint, bigint[]) from public, anon;
revoke all on function public.regenerate_question_with_credit(bigint, bigint, jsonb, integer, text) from public, anon, authenticated;

grant execute on function public.update_exam_question(bigint, bigint, jsonb) to authenticated;
grant execute on function public.add_exam_question(bigint, integer, jsonb) to authenticated;
grant execute on function public.delete_exam_question(bigint, bigint) to authenticated;
grant execute on function public.reorder_exam_questions(bigint, bigint[]) to authenticated;
grant execute on function public.regenerate_question_with_credit(bigint, bigint, jsonb, integer, text) to service_role;
