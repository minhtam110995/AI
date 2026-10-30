-- Viral Finder: dùng thử Pro 3 ngày khi đăng ký + trang Quản trị.
-- Chạy sau 001 và 002 (SQL Editor → dán → Run). Chạy lại nhiều lần không sao.

-- ---------- Dùng thử 3 ngày ----------
alter table public.profiles add column if not exists is_trial boolean not null default false;
alter table public.profiles add column if not exists note text;          -- ghi chú của quản trị
alter table public.profiles add column if not exists blocked boolean not null default false;

-- Mỗi máy chỉ được dùng thử 1 lần (chống tạo nhiều email để dùng thử mãi)
create table if not exists public.trial_devices (
  device_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.trial_devices enable row level security;

-- Tài khoản mới: tặng Pro 3 ngày
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, plan, plan_expires_at, is_trial)
    values (new.id, new.email, 'pro', now() + interval '3 days', true)
    on conflict (id) do nothing;
  return new;
end $$;

-- Thanh toán xong thì hết là dùng thử; gia hạn nối tiếp ngày hết hạn hiện tại (kể cả đang dùng thử)
create or replace function public.apply_payment(p_order_code bigint, p_amount bigint)
returns json language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
  prof public.profiles;
  base timestamptz;
begin
  select * into pay from public.payments where order_code = p_order_code for update;
  if not found then return json_build_object('ok', false, 'reason', 'unknown order'); end if;
  if pay.status = 'paid' then return json_build_object('ok', true, 'reason', 'already applied'); end if;
  if p_amount < pay.amount then return json_build_object('ok', false, 'reason', 'amount too low'); end if;
  select * into prof from public.profiles where id = pay.user_id for update;
  base := case when prof.plan = pay.plan and prof.plan_expires_at > now() then prof.plan_expires_at else now() end;
  update public.profiles set plan = pay.plan, plan_expires_at = base + make_interval(months => pay.months), is_trial = false
    where id = pay.user_id;
  update public.payments set status = 'paid', paid_at = now() where order_code = p_order_code;
  return json_build_object('ok', true, 'plan', pay.plan, 'expires_at', base + make_interval(months => pay.months));
end $$;
revoke all on function public.apply_payment(bigint, bigint) from public, anon, authenticated;
grant execute on function public.apply_payment(bigint, bigint) to service_role;

-- Gói hiệu lực + ghi nhận máy. Thêm: dùng thử chỉ tính 1 lần / máy; tài khoản bị khoá → 'blocked'.
create or replace function public.check_access(p_device_id text, p_device_name text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  eff text;
  lim int;
  known boolean;
  used int;
  trial_ok boolean := true;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_device_id is null or length(p_device_id) not between 8 and 64 then raise exception 'bad device id'; end if;
  select * into prof from public.profiles where id = uid;
  if not found then
    insert into public.profiles (id, email) select id, email from auth.users where id = uid on conflict (id) do nothing;
    select * into prof from public.profiles where id = uid;
  end if;
  eff := case when prof.plan <> 'free' and prof.plan_expires_at > now() then prof.plan else 'free' end;
  -- Máy này đã dùng thử bằng tài khoản khác → tài khoản này không được dùng thử
  if eff <> 'free' and prof.is_trial then
    insert into public.trial_devices (device_id, user_id) values (p_device_id, uid) on conflict (device_id) do nothing;
    select user_id = uid into trial_ok from public.trial_devices where device_id = p_device_id;
    if not trial_ok then eff := 'free'; end if;
  end if;
  if prof.blocked then eff := 'blocked'; end if;
  lim := public.device_limit(eff);
  select exists(select 1 from public.devices where user_id = uid and device_id = p_device_id) into known;
  select count(*) into used from public.devices where user_id = uid;
  if known then
    update public.devices set last_seen = now(), name = coalesce(p_device_name, name) where user_id = uid and device_id = p_device_id;
  elsif used < lim then
    insert into public.devices (user_id, device_id, name) values (uid, p_device_id, p_device_name);
    used := used + 1;
    known := true;
  end if;
  return json_build_object(
    'email', prof.email, 'plan', eff, 'paid_plan', prof.plan, 'expires_at', prof.plan_expires_at,
    'is_trial', prof.is_trial and trial_ok, 'trial_denied', not trial_ok,
    'device_ok', known, 'device_limit', lim, 'devices_used', used, 'server_time', now(),
    'is_admin', public.is_admin());
end $$;

-- ---------- Quản trị ----------
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;
insert into public.admins (email) values ('tamneu1995@gmail.com') on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins a join auth.users u on lower(u.email) = lower(a.email) where u.id = auth.uid())
$$;

-- Nhật ký thao tác của quản trị
create table if not exists public.admin_log (
  id bigserial primary key,
  admin_email text, action text, target uuid, detail jsonb, created_at timestamptz not null default now()
);
alter table public.admin_log enable row level security;

create or replace function public.admin_guard() returns text
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  if not public.is_admin() then raise exception 'chỉ quản trị viên được dùng'; end if;
  select email into e from auth.users where id = auth.uid();
  return e;
end $$;

-- Tổng quan
create or replace function public.admin_stats() returns json
language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform public.admin_guard();
  select json_build_object(
    'users', (select count(*) from public.profiles),
    'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'paying', (select count(*) from public.profiles where plan <> 'free' and plan_expires_at > now() and not is_trial),
    'trial', (select count(*) from public.profiles where is_trial and plan_expires_at > now()),
    'expiring_7d', (select count(*) from public.profiles where plan <> 'free' and not is_trial and plan_expires_at between now() and now() + interval '7 days'),
    'revenue_today', (select coalesce(sum(amount), 0) from public.payments where status = 'paid' and paid_at >= date_trunc('day', now())),
    'revenue_month', (select coalesce(sum(amount), 0) from public.payments where status = 'paid' and paid_at >= date_trunc('month', now())),
    'revenue_all', (select coalesce(sum(amount), 0) from public.payments where status = 'paid'),
    'pending', (select count(*) from public.payments where status = 'pending' and created_at > now() - interval '3 days'),
    'by_day', (select coalesce(json_agg(d order by d.day), '[]') from (
      select to_char(date_trunc('day', paid_at), 'YYYY-MM-DD') as day, sum(amount) as amount, count(*) as n
      from public.payments where status = 'paid' and paid_at > now() - interval '30 days' group by 1) d)
  ) into r;
  return r;
end $$;

-- Danh sách khách (tìm theo email), lọc: all | paying | trial | expiring | expired | free
create or replace function public.admin_users(p_q text default '', p_filter text default 'all', p_limit int default 100)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  perform public.admin_guard();
  select coalesce(json_agg(x), '[]') into r from (
    select p.id, p.email, p.plan, p.plan_expires_at, p.is_trial, p.blocked, p.note, p.created_at,
      (select count(*) from public.devices d where d.user_id = p.id) as devices,
      (select max(last_seen) from public.devices d where d.user_id = p.id) as last_seen,
      (select coalesce(sum(amount), 0) from public.payments y where y.user_id = p.id and y.status = 'paid') as paid_total
    from public.profiles p
    where (coalesce(p_q, '') = '' or p.email ilike '%' || p_q || '%')
      and case p_filter
        when 'paying' then p.plan <> 'free' and p.plan_expires_at > now() and not p.is_trial
        when 'trial' then p.is_trial and p.plan_expires_at > now()
        when 'expiring' then p.plan <> 'free' and p.plan_expires_at between now() and now() + interval '7 days'
        when 'expired' then p.plan_expires_at is not null and p.plan_expires_at <= now()
        when 'free' then p.plan = 'free' or p.plan_expires_at is null or p.plan_expires_at <= now()
        else true end
    order by p.created_at desc limit least(greatest(p_limit, 1), 500)) x;
  return r;
end $$;

-- Lịch sử thanh toán + máy của 1 khách
create or replace function public.admin_user_detail(p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return json_build_object(
    'payments', (select coalesce(json_agg(y order by y.created_at desc), '[]') from public.payments y where y.user_id = p_user),
    'devices', (select coalesce(json_agg(d order by d.last_seen desc), '[]') from public.devices d where d.user_id = p_user));
end $$;

-- Tặng / gia hạn thêm N ngày gói Pro (cộng nối tiếp nếu còn hạn)
create or replace function public.admin_extend(p_user uuid, p_days int, p_note text default null) returns json
language plpgsql security definer set search_path = public as $$
declare e text; base timestamptz; prof public.profiles;
begin
  e := public.admin_guard();
  if p_days is null or p_days = 0 or abs(p_days) > 3650 then raise exception 'số ngày không hợp lệ'; end if;
  select * into prof from public.profiles where id = p_user for update;
  base := case when prof.plan <> 'free' and prof.plan_expires_at > now() then prof.plan_expires_at else now() end;
  update public.profiles set plan = 'pro', plan_expires_at = base + make_interval(days => p_days), is_trial = false where id = p_user;
  insert into public.admin_log (admin_email, action, target, detail) values (e, 'extend', p_user, json_build_object('days', p_days, 'note', p_note));
  return json_build_object('ok', true, 'expires_at', base + make_interval(days => p_days));
end $$;

-- Khoá / mở khoá, ghi chú
create or replace function public.admin_set(p_user uuid, p_blocked boolean default null, p_note text default null) returns json
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  e := public.admin_guard();
  update public.profiles set blocked = coalesce(p_blocked, blocked), note = coalesce(p_note, note) where id = p_user;
  insert into public.admin_log (admin_email, action, target, detail) values (e, 'set', p_user, json_build_object('blocked', p_blocked, 'note', p_note));
  return json_build_object('ok', true);
end $$;

-- Xoá máy của khách (khách đổi máy)
create or replace function public.admin_clear_devices(p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
declare e text; n int;
begin
  e := public.admin_guard();
  delete from public.devices where user_id = p_user;
  get diagnostics n = row_count;
  insert into public.admin_log (admin_email, action, target, detail) values (e, 'clear_devices', p_user, json_build_object('n', n));
  return json_build_object('ok', true, 'removed', n);
end $$;

-- Đơn chờ thanh toán (để đối soát khi khách chuyển sai nội dung)
create or replace function public.admin_pending() returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return (select coalesce(json_agg(x order by x.created_at desc), '[]') from (
    select y.order_code, y.amount, y.plan, y.months, y.transfer_content, y.created_at, p.email
    from public.payments y join public.profiles p on p.id = y.user_id
    where y.status = 'pending' and y.created_at > now() - interval '14 days') x);
end $$;

-- Kích hoạt tay 1 đơn (khách đã chuyển nhưng ghi sai nội dung)
create or replace function public.admin_mark_paid(p_order_code bigint) returns json
language plpgsql security definer set search_path = public as $$
declare e text; amt bigint; r json;
begin
  e := public.admin_guard();
  select amount into amt from public.payments where order_code = p_order_code;
  if amt is null then raise exception 'không có đơn này'; end if;
  r := public.apply_payment(p_order_code, amt);
  insert into public.admin_log (admin_email, action, detail) values (e, 'mark_paid', json_build_object('order', p_order_code, 'result', r));
  return r;
end $$;

-- Quản lý danh sách quản trị viên
create or replace function public.admin_admins(p_add text default null, p_remove text default null) returns json
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  e := public.admin_guard();
  if p_add is not null and p_add ~ '^[^@\s]+@[^@\s]+$' then insert into public.admins values (lower(p_add)) on conflict do nothing; end if;
  if p_remove is not null and lower(p_remove) <> lower(e) then delete from public.admins where email = lower(p_remove); end if;
  return (select json_agg(email order by email) from public.admins);
end $$;

-- Chỉ người đăng nhập mới gọi được; bên trong tự kiểm tra quyền quản trị
do $$ declare f text; begin
  foreach f in array array['admin_stats()', 'admin_users(text, text, int)', 'admin_user_detail(uuid)', 'admin_extend(uuid, int, text)',
    'admin_set(uuid, boolean, text)', 'admin_clear_devices(uuid)', 'admin_pending()', 'admin_mark_paid(bigint)', 'admin_admins(text, text)', 'is_admin()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.admin_guard() from public, anon;
grant execute on function public.admin_guard() to authenticated;
