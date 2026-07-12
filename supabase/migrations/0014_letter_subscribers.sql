-- 0014_letter_subscribers.sql — The Letter TL-1
-- Real subscriptions for the weekly editorial newsletter, DOUBLE OPT-IN:
-- the homepage form creates a 'pending' row and a confirmation email goes
-- out; only the signed confirm link moves a row to 'subscribed' (and only
-- then does the welcome email send). Unsubscribe (footer link + RFC 8058
-- one-click) flips to 'unsubscribed' — rows are never deleted, so a
-- returning subscriber re-confirms through the same flow.
--
-- No token columns: confirm/unsubscribe links are stateless HMAC
-- (CRON_SECRET-signed, scope-prefixed) like the digest unsubscribe layer.
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval, after the TL-1 merge (same procedure as 0009–0013).
-- Until applied: the subscribe API returns 503 ("has 0014 been applied?")
-- and the homepage form surfaces a friendly try-again-later — nothing
-- else breaks, no email sends.

create table if not exists public.letter_subscribers (
  id               uuid primary key default gen_random_uuid(),
  -- stored lowercased/trimmed; the unique index is the dedupe
  email            text not null unique,
  status           text not null default 'pending'
                     check (status in ('pending','subscribed','unsubscribed')),
  source           text not null default 'homepage',
  -- resend throttle for the confirmation email (10-minute window)
  confirm_sent_at  timestamptz,
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists letter_subscribers_status_idx
  on public.letter_subscribers (status, created_at desc);

alter table public.letter_subscribers enable row level security;
-- No policies on purpose: service-role only via the letter API routes
-- (same posture as the lead tables — anon/authed clients are blind).

drop trigger if exists letter_subscribers_touch_updated on public.letter_subscribers;
create trigger letter_subscribers_touch_updated
  before update on public.letter_subscribers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Rollback (manual, documented only — do not run casually):
--   drop table if exists public.letter_subscribers;
-- Subscriber rows are consent records — export before any drop.
-- ---------------------------------------------------------------------------
