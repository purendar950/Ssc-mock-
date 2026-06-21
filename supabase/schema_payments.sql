-- ===========================================================
-- ExamZen - Payments & Partner schema (run AFTER schema.sql)
-- Adds tables for premium purchases and the partner/affiliate
-- program, with RLS + SECURITY DEFINER RPCs so admin approvals
-- happen atomically and securely server-side.
-- ===========================================================

-- 1) TABLES -------------------------------------------------
create table if not exists public.payment_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  username     text,
  email        text,
  phone        text,
  utr          text,
  amount       integer not null,
  discount     integer not null default 0,
  coupon_used  text default 'NONE',
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid
);

create table if not exists public.partner_applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  username     text,
  email        text,
  phone        text,
  upi_id       text,
  social_links text,
  coupon_code  text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  applied_at   timestamptz not null default now(),
  approved_at  timestamptz
);

create table if not exists public.partners (
  coupon_code    text primary key,
  user_id        uuid references auth.users(id) on delete cascade,
  username       text,
  upi_id         text,
  total_sales    integer not null default 0,
  total_revenue  integer not null default 0,
  total_withdrawn integer not null default 0,
  pending_payout integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.payout_requests (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid,
  coupon_code  text,
  amount       integer not null,
  upi_id       text,
  status       text not null default 'pending' check (status in ('pending','paid','rejected')),
  requested_at timestamptz not null default now(),
  paid_at      timestamptz
);

-- 2) RLS ----------------------------------------------------
alter table public.payment_requests   enable row level security;
alter table public.partner_applications enable row level security;
alter table public.partners            enable row level security;
alter table public.payout_requests     enable row level security;

drop policy if exists "pay insert self" on public.payment_requests;
create policy "pay insert self" on public.payment_requests
  for insert with check (user_id = auth.uid());
drop policy if exists "pay read own/admin" on public.payment_requests;
create policy "pay read own/admin" on public.payment_requests
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "app insert self" on public.partner_applications;
create policy "app insert self" on public.partner_applications
  for insert with check (user_id = auth.uid());
drop policy if exists "app read own/admin" on public.partner_applications;
create policy "app read own/admin" on public.partner_applications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "partners read own/admin" on public.partners;
create policy "partners read own/admin" on public.partners
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "payouts read own/admin" on public.payout_requests;
create policy "payouts read own/admin" on public.payout_requests
  for select using (public.is_admin() or exists (
    select 1 from public.partners p where p.coupon_code = payout_requests.coupon_code and p.user_id = auth.uid()
  ));
-- Mutations on the tables above happen only through the RPCs below
-- (SECURITY DEFINER), so no client UPDATE/DELETE policies are granted.

-- 3) COUPON RESOLUTION (public) -----------------------------
create or replace function public.resolve_coupon(code text)
returns json language plpgsql security definer set search_path = public stable as $$
declare c text := upper(coalesce(code, ''));
begin
  if c = '' then return json_build_object('valid', true, 'code', 'NONE', 'price', 124, 'discount', 0); end if;
  if c = 'WELCOME' then return json_build_object('valid', true, 'code', 'WELCOME', 'price', 99, 'discount', 25); end if;
  if exists (select 1 from public.partners where coupon_code = c and is_active) then
    return json_build_object('valid', true, 'code', c, 'price', 99, 'discount', 25, 'partner', true);
  end if;
  return json_build_object('valid', false, 'code', c, 'price', 124, 'discount', 0);
end; $$;
grant execute on function public.resolve_coupon(text) to anon, authenticated;

-- 4) ADMIN/PARTNER RPCs -------------------------------------
create or replace function public.approve_payment(req_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.payment_requests; earn integer;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select * into r from public.payment_requests where id = req_id;
  if r.id is null or r.status <> 'pending' then raise exception 'invalid request'; end if;
  update public.payment_requests set status='approved', processed_at=now(), processed_by=auth.uid() where id=req_id;
  update public.profiles set is_paid=true, expires_at=now() + interval '365 days' where id=r.user_id;
  if r.coupon_used is not null and r.coupon_used <> 'NONE' then
    earn := round(coalesce(r.discount,0) * 0.8);
    update public.partners set total_sales=total_sales+1, total_revenue=total_revenue+earn, pending_payout=pending_payout+earn
      where coupon_code=r.coupon_used;
  end if;
end; $$;

create or replace function public.reject_payment(req_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.payment_requests set status='rejected', processed_at=now(), processed_by=auth.uid()
    where id=req_id and status='pending';
end; $$;

create or replace function public.approve_application(app_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.partner_applications;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select * into a from public.partner_applications where id=app_id;
  if a.id is null or a.status <> 'pending' then raise exception 'invalid application'; end if;
  if exists (select 1 from public.partners where coupon_code = upper(a.coupon_code)) then raise exception 'coupon taken'; end if;
  update public.partner_applications set status='approved', approved_at=now() where id=app_id;
  insert into public.partners (coupon_code, user_id, username, upi_id)
    values (upper(a.coupon_code), a.user_id, a.username, a.upi_id);
  update public.profiles set is_partner=true where id=a.user_id;
end; $$;

create or replace function public.reject_application(app_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.partner_applications set status='rejected' where id=app_id and status='pending';
end; $$;

create or replace function public.request_payout(amt integer)
returns void language plpgsql security definer set search_path = public as $$
declare p public.partners;
begin
  select * into p from public.partners where user_id = auth.uid();
  if p.coupon_code is null then raise exception 'not a partner'; end if;
  if amt < 100 then raise exception 'minimum payout is 100'; end if;
  if amt > p.pending_payout then raise exception 'amount exceeds balance'; end if;
  insert into public.payout_requests (partner_id, coupon_code, amount, upi_id)
    values (p.user_id, p.coupon_code, amt, p.upi_id);
end; $$;

create or replace function public.pay_payout(po_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare po public.payout_requests;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  select * into po from public.payout_requests where id=po_id;
  if po.id is null or po.status <> 'pending' then raise exception 'invalid payout'; end if;
  update public.payout_requests set status='paid', paid_at=now() where id=po_id;
  update public.partners set pending_payout=greatest(0, pending_payout - po.amount), total_withdrawn=total_withdrawn + po.amount
    where coupon_code=po.coupon_code;
end; $$;

create or replace function public.reject_payout(po_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.payout_requests set status='rejected' where id=po_id and status='pending';
end; $$;

grant execute on function public.approve_payment(uuid), public.reject_payment(uuid),
  public.approve_application(uuid), public.reject_application(uuid),
  public.request_payout(integer), public.pay_payout(uuid), public.reject_payout(uuid)
  to authenticated;

-- Admin dashboard counts
create or replace function public.admin_stats()
returns json language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'premium', (select count(*) from public.profiles where is_paid = true),
    'revenue', (select coalesce(sum(amount),0) from public.payment_requests where status='approved'),
    'partners', (select count(*) from public.partners)
  );
end; $$;
grant execute on function public.admin_stats() to authenticated;
