-- P1 Billing Lifecycle
--
-- Melengkapi P0 (yang hanya menutup celah keamanan) dengan siklus hidup billing
-- yang sebenarnya:
--   1. Langganan premium yang lewat masa berlaku tidak pernah turun — pengguna
--      tetap tercatat premium selamanya.
--   2. Order pending tidak pernah ditutup sendiri sehingga menumpuk.
--   3. Tidak ada cara menemukan order yang webhook-nya hilang, sehingga
--      pembayaran sah bisa tidak pernah dipenuhi.
--   4. Order yang sempat ditandai expired harus tetap bisa dipenuhi bila
--      ternyata dibayar — uang yang sudah masuk tidak boleh hangus.
--
-- Semua fungsi di sini hanya untuk server (service role): klien tidak boleh
-- memicu maintenance atau membaca order pengguna lain.

-- ---------------------------------------------------------------------------
-- 1. Penurunan langganan yang sudah kedaluwarsa
-- ---------------------------------------------------------------------------

-- Menurunkan profil premium yang masa berlakunya sudah lewat kembali ke free.
--
-- Premium TANPA tanggal kedaluwarsa sengaja dilewati (berarti berlaku selamanya),
-- dan saldo kredit tidak pernah disentuh — kedaluwarsa langganan hanya mencabut
-- akses premium, bukan kredit yang sudah dibeli.
create or replace function public.expire_subscriptions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with expired as (
    update public.profiles
       set subscription_tier = 'free',
           subscription_expiry = null
     where subscription_tier = 'premium'
       and subscription_expiry is not null
       and subscription_expiry <= now()
    returning id
  )
  select count(*) into v_count from expired;

  return jsonb_build_object(
    'expired_count', v_count,
    'checked_at', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Penutupan order pending yang kedaluwarsa
-- ---------------------------------------------------------------------------

-- Menandai order pending yang dibuat lebih lama dari TTL sebagai expired.
--
-- Hanya menyentuh status 'pending': order yang sudah lunas tidak pernah diubah,
-- dan order yang gagal/batal tidak dihidupkan kembali.
create or replace function public.expire_stale_payment_orders(p_ttl_minutes integer default 1440)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_ttl_minutes is null or p_ttl_minutes < 1 then
    raise exception 'TTL order harus minimal 1 menit.' using errcode = '22023';
  end if;

  with stale as (
    update public.payment_orders
       set status = 'expired'
     where status = 'pending'
       and created_at < now() - make_interval(mins => p_ttl_minutes)
    returning id
  )
  select count(*) into v_count from stale;

  return jsonb_build_object(
    'expired_count', v_count,
    'ttl_minutes', p_ttl_minutes
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Daftar order yang perlu direkonsiliasi ke Mayar
-- ---------------------------------------------------------------------------

-- Order yang webhook-nya kemungkinan besar hilang: masih pending, atau sudah
-- ditandai expired padahal pembayaran bisa saja telat masuk.
--
-- Order tanpa invoice dilewati (tidak ada yang bisa ditanyakan ke Mayar), dan
-- order di luar jendela waktu diabaikan supaya rekonsiliasi tidak mengejar
-- transaksi lama tanpa batas.
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
           o.provider_order_id,
           o.status,
           o.amount,
           o.credits,
           o.duration_months,
           o.created_at
      from public.payment_orders o
     where o.provider_order_id is not null
       and o.status in ('pending', 'expired')
       and o.created_at >= now() - make_interval(days => p_days)
     order by o.created_at
     limit p_limit
  ) as candidate;

  return jsonb_build_object('orders', v_orders);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Hak akses: hanya service role (Edge Function)
-- ---------------------------------------------------------------------------

revoke all on function public.expire_subscriptions() from public;
revoke all on function public.expire_stale_payment_orders(integer) from public;
revoke all on function public.orders_for_reconciliation(integer, integer) from public;

revoke all on function public.expire_subscriptions() from anon, authenticated;
revoke all on function public.expire_stale_payment_orders(integer) from anon, authenticated;
revoke all on function public.orders_for_reconciliation(integer, integer) from anon, authenticated;

grant execute on function public.expire_subscriptions() to service_role;
grant execute on function public.expire_stale_payment_orders(integer) to service_role;
grant execute on function public.orders_for_reconciliation(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Index pendukung sweep
-- ---------------------------------------------------------------------------

-- Sweep menyaring status + created_at; P0 sudah punya index status dan
-- (user_id, created_at). Index komposit ini membuat sweep global tetap murah
-- saat tabel order membesar.
create index if not exists payment_orders_status_created_idx
  on public.payment_orders (status, created_at);
