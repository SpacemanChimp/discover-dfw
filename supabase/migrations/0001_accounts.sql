-- Discover DFW · Phase 7: accounts, shelf persistence, lead storage.
-- Run in Supabase Dashboard → SQL Editor (or `supabase db push`).

-- ---------- profiles: one row per auth user, created by trigger ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  letter_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill any users who signed up before this migration ran
insert into public.profiles (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

-- ---------- saved homes: "the shelf" ----------
create table if not exists public.saved_homes (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_key text not null,
  saved_at timestamptz not null default now(),
  price_at_save integer not null,
  primary key (user_id, listing_key)
);

-- ---------- saved searches: "standing orders" ----------
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  filters jsonb,
  query_label text not null default '',
  query_string text not null default '',
  frequency text not null default 'Daily digest',
  created_at timestamptz not null default now()
);

create index if not exists saved_searches_user_idx on public.saved_searches (user_id, created_at desc);

-- ---------- leads: showing requests, questions, signups ----------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  type text not null,
  listing_key text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.saved_homes enable row level security;
alter table public.saved_searches enable row level security;
alter table public.leads enable row level security;

-- profiles: owners read/update; creation is trigger-owned, no client insert/delete
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = (select auth.uid()));
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- saved_homes: full CRUD scoped to the owner
drop policy if exists "saved_homes_all_own" on public.saved_homes;
create policy "saved_homes_all_own" on public.saved_homes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- saved_searches: full CRUD scoped to the owner
drop policy if exists "saved_searches_all_own" on public.saved_searches;
create policy "saved_searches_all_own" on public.saved_searches
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- leads: NO client policies — inserts happen only through /api/leads with the
-- secret key, so guests can submit without opening an RLS hole.
