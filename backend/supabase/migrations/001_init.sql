-- TikTok Analyzer: tài khoản, gói cước, thiết bị, thanh toán.
-- Chạy trong Supabase: SQL Editor → dán toàn bộ file → Run.

-- ---------- Hồ sơ người dùng (1 dòng / tài khoản) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  plan_expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Tự tạo hồ sơ khi có người đăng ký
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Thiết bị đang dùng tài khoản ----------
create table if not exists public.devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (length(device_id) between 8 and 64),
  name text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_id)
);

-- ---------- Thanh toán ----------
create table if not exists public.payments (
  order_code bigint primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('pro', 'team')),
  months int not null check (months between 1 and 24),
  amount bigint not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  checkout_url text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);

-- ---------- Quyền đọc/ghi (RLS) ----------
-- Người dùng chỉ ĐỌC được dữ liệu của chính mình; gói cước chỉ máy chủ (service role) được sửa.
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.payments enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own devices" on public.devices;
create policy "own devices" on public.devices for select using (auth.uid() = user_id);
drop policy if exists "remove own device" on public.devices;
create policy "remove own device" on public.devices for delete using (auth.uid() = user_id);
drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments for select using (auth.uid() = user_id);

-- Số máy được dùng theo gói
create or replace function public.device_limit(p_plan text) returns int
language sql immutable as $$
  select case p_plan when 'team' then 5 when 'pro' then 2 else 1 end
$$;

-- Tiện ích gọi hàm này mỗi ngày: trả gói đang hiệu lực và ghi nhận máy đang dùng.
-- Gói đã hết hạn được tính là 'free'. Máy mới vượt giới hạn → device_ok = false.
create or replace function public.check_access(p_device_id text, p_device_name text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  eff text;
  lim int;
  known boolean;
  used int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_device_id is null or length(p_device_id) not between 8 and 64 then raise exception 'bad device id'; end if;
  select * into prof from public.profiles where id = uid;
  if not found then
    insert into public.profiles (id, email) select id, email from auth.users where id = uid
      on conflict (id) do nothing;
    select * into prof from public.profiles where id = uid;
  end if;
  eff := case when prof.plan <> 'free' and prof.plan_expires_at > now() then prof.plan else 'free' end;
  lim := public.device_limit(eff);
  select exists(select 1 from public.devices where user_id = uid and device_id = p_device_id) into known;
  select count(*) into used from public.devices where user_id = uid;
  if known then
    update public.devices set last_seen = now(), name = coalesce(p_device_name, name)
      where user_id = uid and device_id = p_device_id;
  elsif used < lim then
    insert into public.devices (user_id, device_id, name) values (uid, p_device_id, p_device_name);
    used := used + 1;
    known := true;
  end if;
  return json_build_object(
    'email', prof.email, 'plan', eff, 'paid_plan', prof.plan, 'expires_at', prof.plan_expires_at,
    'device_ok', known, 'device_limit', lim, 'devices_used', used, 'server_time', now());
end $$;
revoke all on function public.check_access(text, text) from public, anon;
grant execute on function public.check_access(text, text) to authenticated;

-- Ghi nhận 1 thanh toán thành công và cộng thêm thời hạn (chỉ máy chủ gọi, chạy lại không cộng 2 lần)
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
  -- Còn hạn cùng gói → cộng nối tiếp; đổi gói hoặc đã hết hạn → tính từ bây giờ
  base := case when prof.plan = pay.plan and prof.plan_expires_at > now() then prof.plan_expires_at else now() end;
  update public.profiles set plan = pay.plan, plan_expires_at = base + make_interval(months => pay.months)
    where id = pay.user_id;
  update public.payments set status = 'paid', paid_at = now() where order_code = p_order_code;
  return json_build_object('ok', true, 'plan', pay.plan, 'expires_at', base + make_interval(months => pay.months));
end $$;
revoke all on function public.apply_payment(bigint, bigint) from public, anon, authenticated;
grant execute on function public.apply_payment(bigint, bigint) to service_role;
