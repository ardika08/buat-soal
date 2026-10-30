-- Status akses E-Book di sisi database.
--
-- Akses E-Book otomatis mengikuti langganan: begitu `subscription_tier` menjadi
-- premium (mis. setelah `fulfill_payment_order`) dan masa berlakunya belum lewat,
-- pengguna langsung berhak tanpa proses pemberian manual. `expire_subscriptions()`
-- (dijalankan rekonsiliasi billing) menurunkan yang kedaluwarsa sehingga akses
-- ikut dicabut otomatis.
--
-- Fungsi ini menjadi rujukan aturan di DB untuk pemakaian internal (service_role).

create or replace function public.emodul_access_status(p_user_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user_id;

  if v_profile.id is null then
    raise exception 'not_found';
  end if;

  return jsonb_build_object(
    'entitled', (
      v_profile.subscription_tier = 'premium'
      and (v_profile.subscription_expiry is null or v_profile.subscription_expiry > now())
    ),
    'tier', case when v_profile.subscription_tier = 'premium' then 'premium' else 'free' end,
    'expires_at', v_profile.subscription_expiry
  );
end;
$$;

revoke all on function public.emodul_access_status(bigint) from public, anon, authenticated;
grant execute on function public.emodul_access_status(bigint) to service_role;
