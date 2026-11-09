alter table public.profiles
  alter column credits_balance set default 100;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_profile_id bigint;
begin
  insert into public.profiles (auth_user_id, name, email, credits_balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Pengguna'),
    new.email,
    100
  )
  on conflict (auth_user_id) do update
    set name = excluded.name,
        email = excluded.email
  returning id into inserted_profile_id;

  insert into public.credit_transactions (user_id, type, amount, description)
  values (inserted_profile_id, 'bonus', 100, 'Kredit gratis selamat datang untuk pengguna baru.')
  on conflict do nothing;

  return new;
end;
$$;
