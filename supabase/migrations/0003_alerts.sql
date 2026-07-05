-- Discover DFW · Phase 9: alerts on saved listings.
-- Run in Supabase Dashboard → SQL Editor.

-- open-house change detection baseline (signature "date|window")
alter table public.saved_listings add column if not exists last_seen_open_house text;

-- per-user kill switch for alert emails
alter table public.profiles add column if not exists alerts_opt_out boolean not null default false;

-- alert log: one row per detected change; doubles as an in-app feed later
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_key text not null,
  alert_type text not null check (alert_type in ('price_drop', 'status_change', 'open_house')),
  detail jsonb not null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);

create index if not exists alerts_user_idx on public.alerts (user_id, created_at desc);

alter table public.alerts enable row level security;

-- users may read their own alert history; ONLY the system job (secret key)
-- writes — no client insert/update/delete policies.
drop policy if exists "alerts_select_own" on public.alerts;
create policy "alerts_select_own" on public.alerts
  for select using (user_id = (select auth.uid()));
