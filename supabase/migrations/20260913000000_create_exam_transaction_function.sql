-- Transactional exam creation: inserts exam_session + questions,
-- deducts credits, and logs the transaction atomically.
-- If any step fails, the entire operation rolls back — no orphaned
-- exam_sessions, no missing questions, no lost credits.

create or replace function public.create_exam_with_questions(
  p_user_id bigint,
  p_exam jsonb,
  p_questions jsonb,
  p_required_credits integer,
  p_description text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id bigint;
  v_exam jsonb;
  v_questions jsonb;
  v_new_balance integer;
begin
  -- 1. Insert exam session
  insert into public.exam_sessions (
    user_id, curriculum, exam_type, class_phase, subject, semester,
    time_allocation, reference_type, difficulty, cognitive_levels,
    pg_options, include_illustration, topics, credits_consumed
  )
  values (
    p_user_id,
    p_exam->>'curriculum',
    p_exam->>'exam_type',
    p_exam->>'class_phase',
    p_exam->>'subject',
    coalesce(p_exam->>'semester', 'Ganjil'),
    coalesce((p_exam->>'time_allocation')::integer, 90),
    coalesce(p_exam->>'reference_type', 'AI'),
    coalesce(p_exam->>'difficulty', 'Campuran Berimbang'),
    p_exam->'cognitive_levels',
    p_exam->>'pg_options',
    coalesce((p_exam->>'include_illustration')::boolean, false),
    p_exam->'topics',
    p_required_credits
  )
  returning id into v_exam_id;

  -- Fetch the full exam record as jsonb
  select to_jsonb(e.*) into v_exam from public.exam_sessions e where e.id = v_exam_id;

  -- 2. Insert all questions atomically
  insert into public.questions (
    exam_session_id, order_number, question_type, cognitive_level,
    difficulty, question_content, options, correct_answer,
    illustration_prompt, illustration_image
  )
  select
    v_exam_id,
    q.ord::integer,
    q.val->>'question_type',
    nullif(q.val->>'cognitive_level', ''),
    nullif(q.val->>'difficulty', ''),
    q.val->>'question_content',
    q.val->'options',
    q.val->>'correct_answer',
    nullif(q.val->>'illustration_prompt', ''),
    nullif(q.val->>'illustration_image', '')
  from jsonb_array_elements(p_questions) with ordinality as q(val, ord);

  -- Fetch inserted questions (ordered by order_number)
  select jsonb_agg(to_jsonb(q.*) order by q.order_number)
  into v_questions
  from public.questions q
  where q.exam_session_id = v_exam_id;

  if v_questions is null then
    raise exception 'questions_insert_failed';
  end if;

  -- 3. Deduct credits atomically (race-condition safe)
  update public.profiles
  set credits_balance = credits_balance - p_required_credits
  where id = p_user_id and credits_balance >= p_required_credits
  returning credits_balance into v_new_balance;

  if not found then
    raise exception 'insufficient_credits';
  end if;

  -- 4. Log the credit transaction
  insert into public.credit_transactions (user_id, type, amount, description)
  values (p_user_id, 'deduction', -p_required_credits, p_description);

  return jsonb_build_object(
    'exam', v_exam,
    'questions', v_questions,
    'credits_remaining', v_new_balance
  );
end;
$$;
