-- ===========================================================
-- ExamZen - Supabase schema
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query
-- It creates the profiles table, auto-creates a profile on signup,
-- enforces Row Level Security, and adds the RPCs the app needs for
-- username-based login.
-- ===========================================================

-- 1) PROFILES TABLE -----------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique,
  name          text,
  email         text,
  is_paid       boolean     not null default false,
  expires_at    timestamptz,
  role          text        not null default 'user' check (role in ('user', 'admin')),
  is_partner    boolean     not null default false,
  partner_coupon text,
  created_at    timestamptz not null default now()
);

-- 2) AUTO-CREATE A PROFILE ON SIGNUP ------------------------
-- Reads username/name from the signUp() user_metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, name, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) HELPER: is the current user an admin? ------------------
-- security definer avoids recursive RLS when policies check role.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- 4) ROW LEVEL SECURITY -------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "read own or admin" on public.profiles;
create policy "read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "insert self" on public.profiles;
create policy "insert self" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "update own or admin" on public.profiles;
create policy "update own or admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Prevent non-admins from changing sensitive fields (paywall integrity).
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  new.is_paid        := old.is_paid;
  new.expires_at     := old.expires_at;
  new.role           := old.role;
  new.is_partner     := old.is_partner;
  new.partner_coupon := old.partner_coupon;
  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 5) RPCs FOR USERNAME LOGIN --------------------------------
create or replace function public.username_taken(uname text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where lower(username) = lower(uname));
$$;

create or replace function public.email_for_username(uname text)
returns text
language sql
security definer set search_path = public
stable
as $$
  select email from public.profiles where lower(username) = lower(uname) limit 1;
$$;

grant execute on function public.username_taken(text)    to anon, authenticated;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- ===========================================================
-- AFTER RUNNING THIS:
--   * Make yourself an admin:
--       update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';
--   * Mark a user premium for a year manually (admins can also do this in-app):
--       update public.profiles
--         set is_paid = true, expires_at = now() + interval '365 days'
--         where username = 'SOME_USERNAME';
-- ===========================================================
