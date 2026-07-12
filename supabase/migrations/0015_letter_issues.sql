-- 0015_letter_issues.sql — The Letter TL-2
-- The Sunday issue pipeline: a draft issue is GENERATED from our own data
-- (city_market_snapshots + listings counts), edited by the admin in the
-- Letter Desk, test-sent to the admin's own address, then sent by an
-- explicit human action with a typed confirmation. NO auto-send exists:
-- nothing schedules a send, and the send route requires a live admin
-- session plus the typed phrase.
--
-- letter_sends is the double-send impossibility proof: one row per
-- (issue, subscriber), unique, written BEFORE each Resend call — a
-- crashed send resumes by sending only to subscribers with no row.
--
-- ⚠ NOT applied automatically. Apply via the dashboard SQL editor with
-- explicit approval, after the TL-2 merge (same procedure as 0009–0014).
-- Until applied: the Letter Desk renders with an empty issue list and
-- every issue action 503s ("has 0015 been applied?") — nothing sends.

create table if not exists public.letter_issues (
  id             uuid primary key default gen_random_uuid(),
  -- the Sunday this issue is for (one issue per date; regeneration updates)
  issue_date     date not null unique,
  subject        text,
  -- editable sections: { editorsNote, communityOfWeek: {citySlug, hoodSlug,
  -- blurb} | null } — freeform text runs the risky-claims linter before
  -- an issue can go ready
  sections_json  jsonb,
  -- the week's numbers frozen at generation time: { metro: {actives,
  -- new7d, medianList}, cities: [{slug, name, actives, new7d, median,
  -- medianPrev?}] } — next week's issue diffs against this
  stats_json     jsonb,
  status         text not null default 'draft'
                   check (status in ('draft','ready','sent','canceled')),
  sent_at        timestamptz,
  sent_count     integer not null default 0,
  failed_count   integer not null default 0,
  created_by     text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.letter_issues enable row level security;

drop trigger if exists letter_issues_touch_updated on public.letter_issues;
create trigger letter_issues_touch_updated
  before update on public.letter_issues
  for each row execute function public.touch_updated_at();

create table if not exists public.letter_sends (
  id             uuid primary key default gen_random_uuid(),
  issue_id       uuid not null references public.letter_issues (id) on delete cascade,
  subscriber_id  uuid not null references public.letter_subscribers (id) on delete cascade,
  status         text not null default 'sending'
                   check (status in ('sending','sent','failed')),
  resend_id      text,          -- provider message id when available
  error          text,
  created_at     timestamptz not null default now(),
  -- THE idempotency guarantee: a subscriber can never be sent the same
  -- issue twice — the second insert fails before any Resend call
  unique (issue_id, subscriber_id)
);

create index if not exists letter_sends_issue_idx on public.letter_sends (issue_id, status);

alter table public.letter_sends enable row level security;
-- No policies on either table: service-role only via the admin-gated
-- Letter API (same posture as every other internal table).

-- ---------------------------------------------------------------------------
-- Rollback (manual, documented only — do not run casually):
--   drop table if exists public.letter_sends;
--   drop table if exists public.letter_issues;
-- letter_sends rows are the audit of what was emailed to whom — export
-- before any drop.
-- ---------------------------------------------------------------------------
