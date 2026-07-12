/* The Letter — issue plumbing (TL-2). SERVER-ONLY.

   Draft issues are GENERATED from our own data and edited by a human:
   - metro + per-city stats come from city_market_snapshots (the same
     LIVE NTREIS data class as the public market bands) plus cheap
     head-count queries for listed-in-last-7-days (days_on_market is a
     real indexed column — the raw-jsonb sort/filter trap doesn't apply)
   - freeform sections run the Content Desk risky-claims linter
     (lib/content/community-content-drafts.ts) before an issue can go
     ready — same hard rules, same wording
   Deltas bootstrap from history: each issue freezes its stats, and the
   next issue diffs against the most recent SENT issue's stats. */
import "server-only";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { cities } from "@/lib/dfw-data";
import { RISKY_CLAIM_PATTERNS } from "@/lib/content/community-content-drafts";
import type { IssueStats, IssueSections, IssueCityStat } from "@/lib/email/letter-issue";

export type LetterIssue = {
  id: string;
  issueDate: string;
  subject: string | null;
  sections: IssueSections | null;
  stats: IssueStats | null;
  status: "draft" | "ready" | "sent" | "canceled";
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
  createdBy: string;
  updatedAt: string;
};

type Row = {
  id: string;
  issue_date: string;
  subject: string | null;
  sections_json: IssueSections | null;
  stats_json: IssueStats | null;
  status: LetterIssue["status"];
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  created_by: string;
  updated_at: string;
};

const fromRow = (r: Row): LetterIssue => ({
  id: r.id,
  issueDate: r.issue_date,
  subject: r.subject,
  sections: r.sections_json,
  stats: r.stats_json,
  status: r.status,
  sentAt: r.sent_at,
  sentCount: r.sent_count,
  failedCount: r.failed_count,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
});

const SELECT =
  "id, issue_date, subject, sections_json, stats_json, status, sent_at, sent_count, failed_count, created_by, updated_at";

/** Recent issues, newest first. Empty until 0015 is applied. */
export async function getLetterIssues(): Promise<LetterIssue[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("letter_issues")
      .select(SELECT)
      .order("issue_date", { ascending: false })
      .limit(30);
    if (error || !data) return [];
    return (data as Row[]).map(fromRow);
  } catch {
    return [];
  }
}

/** The most recent SENT issue strictly before `beforeDate` — its frozen
    stats are the delta baseline. */
export async function getPreviousSentIssue(beforeDate: string): Promise<LetterIssue | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    const { data } = await db
      .from("letter_issues")
      .select(SELECT)
      .eq("status", "sent")
      .lt("issue_date", beforeDate)
      .order("issue_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? fromRow(data as Row) : null;
  } catch {
    return null;
  }
}

/** Generate the week's stats from our own store. ~90 cheap head-count
    queries (one per city) + one snapshot read + one metro count —
    admin-triggered, not on any public path. */
export async function generateIssueStats(prev: IssueStats | null): Promise<IssueStats | { error: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { error: "not configured" };

  // city_market_snapshots is a HISTORY table (one row per city per sync
  // day) — current values must use the LATEST row per city; consuming
  // every row quadrupled the metro total in the first generated draft.
  const { data: snaps, error: snapErr } = await db
    .from("city_market_snapshots")
    .select("city_slug, active_listings, median_list_price, as_of")
    .order("as_of", { ascending: false });
  if (snapErr) return { error: `snapshots: ${snapErr.message}` };

  // newest-first walk: first row per city = current; the first row at
  // least 6 days older = the week-ago baseline (delta bootstrap before
  // any sent issue exists to diff against)
  const latest = new Map<string, NonNullable<typeof snaps>[number]>();
  const weekAgo = new Map<string, NonNullable<typeof snaps>[number]>();
  const DAY = 24 * 3600 * 1000;
  for (const s of snaps ?? []) {
    if (!latest.has(s.city_slug)) {
      latest.set(s.city_slug, s);
    } else if (!weekAgo.has(s.city_slug)) {
      const newest = new Date(latest.get(s.city_slug)!.as_of).getTime();
      if (newest - new Date(s.as_of).getTime() >= 6 * DAY) weekAgo.set(s.city_slug, s);
    }
  }

  const nameBySlug = new Map(cities.map((c) => [c.slug, c.name]));
  // delta baseline: the previous SENT issue's frozen stats win; snapshot
  // history fills in when no issue exists yet
  const prevMedian = new Map((prev?.cities ?? []).map((c) => [c.slug, c.median]));

  const { count: metroNew, error: metroErr } = await db
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("standard_status", "Active")
    .lte("days_on_market", 7);
  if (metroErr) return { error: `metro count: ${metroErr.message}` };

  const cityStats: IssueCityStat[] = [];
  let metroActives = 0;
  for (const s of latest.values()) {
    const name = nameBySlug.get(s.city_slug);
    if (!name) continue;
    metroActives += s.active_listings ?? 0;
    const { count } = await db
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("standard_status", "Active")
      .eq("city", name) // listings.city holds the NAME, not the slug
      .lte("days_on_market", 7);
    cityStats.push({
      slug: s.city_slug,
      name,
      actives: s.active_listings ?? 0,
      new7d: count ?? 0,
      median: s.median_list_price,
      medianPrev: prevMedian.get(s.city_slug) ?? weekAgo.get(s.city_slug)?.median_list_price ?? undefined,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    metro: { actives: metroActives, new7d: metroNew ?? 0 },
    cities: cityStats,
  };
}

/* ---- section lint (mirrors the Content Desk discipline) ------------------- */

export type IssueLint = { errors: string[]; warnings: string[] };

export function lintIssue(subject: string | null, sections: IssueSections | null): IssueLint {
  const errors: string[] = [];
  const warnings: string[] = [];
  const subj = (subject ?? "").trim();
  if (!subj) errors.push("[subject] required");
  else if (subj.length > 80) errors.push(`[subject] ${subj.length} chars — keep it under 80`);

  const note = (sections?.editorsNote ?? "").trim();
  if (!note) errors.push("[editorsNote] required — The Letter has a human voice or it doesn't send");
  else if (note.length < 120) errors.push(`[editorsNote] ${note.length} chars — write at least a real paragraph (120+)`);

  const screen = (field: string, text: string) => {
    for (const { re, why } of RISKY_CLAIM_PATTERNS) {
      const m = re.exec(text);
      if (m) errors.push(`[${field}] "${m[0]}" — ${why}`);
    }
  };
  screen("subject", subj);
  screen("editorsNote", note);
  const cow = sections?.communityOfWeek;
  if (cow) {
    if (!cow.blurb?.trim() || cow.blurb.trim().length < 60)
      errors.push("[communityOfWeek] blurb needs at least 60 chars (or remove the section)");
    else screen("communityOfWeek", `${cow.name} ${cow.blurb}`);
  } else {
    warnings.push("[communityOfWeek] none picked — fine, just intentional?");
  }
  return { errors, warnings };
}
