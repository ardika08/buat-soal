-- Migrasi gateway pembayaran: Mayar -> Duitku (sandbox dulu).
--
-- 1. Default kolom `provider` menjadi 'duitku' untuk order baru. Order lama tetap
--    'mayar' agar riwayat tidak berubah.
-- 2. Rekonsiliasi hanya menanyakan order Duitku ke API Duitku. Order Mayar lama
--    tidak boleh dikirim ke API Duitku karena format referensinya berbeda.
--
-- Aman dijalankan berulang.

alter table public.payment_orders
  alter column provider set default 'duitku';

create or replace function public.orders_for_reconciliation(p_limit integer default 50, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orders jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Batas jumlah order harus antara 1 dan 500.' using errcode = '22023';
  end if;

  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'Jendela waktu rekonsiliasi harus antara 1 dan 90 hari.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.created_at), '[]'::jsonb)
    into v_orders
  from (
    select o.id,
           o.user_id,
           o.package_id,
           o.order_type,
           o.provider,
           o.provider_order_id,
           o.status,
           o.amount,
           o.credits,
           o.duration_months,
           o.created_at
      from public.payment_orders o
     where o.provider = 'duitku'
       and o.provider_order_id is not null
       and o.status in ('pending', 'expired')
       and o.created_at >= now() - make_interval(days => p_days)
     order by o.created_at
     limit p_limit
  ) as candidate;

  return jsonb_build_object('orders', v_orders);
end;
$$;

revoke all on function public.orders_for_reconciliation(integer, integer) from public;
revoke all on function public.orders_for_reconciliation(integer, integer) from anon, authenticated;
grant execute on function public.orders_for_reconciliation(integer, integer) to service_role;
