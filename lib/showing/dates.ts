/* Showing-request date logic — PURE + client-safe (only Intl/Date, no React,
   no server-only, no env), so the SAME rules run in the browser sheet AND on
   the server route, and every branch is unit-tested
   (scripts/tests/showing-dates.test.mjs).

   Dates are anchored to America/Chicago (where the market is) so "tomorrow"
   and the 60-day ceiling never drift with the buyer's device timezone. A
   requested day is a bare calendar date ("YYYY-MM-DD"); labels for it are
   formatted in UTC off a noon anchor so the weekday can't slip a day. */

/** How far ahead a showing may be requested (days from Chicago "today"). */
export const SHOWING_MAX_DAYS = 60;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Chicago "today" as YYYY-MM-DD. en-CA yields ISO order. */
export function chicagoTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Add whole days to a bare calendar date, DST-safe (noon-UTC anchor + integer
    UTC day steps — never crosses a daylight boundary mid-arithmetic). */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole-day difference dayISO − baseISO (both bare dates → integer days). */
export function dayDiff(dayISO: string, baseISO: string): number {
  return Math.round((Date.parse(`${dayISO}T12:00:00Z`) - Date.parse(`${baseISO}T12:00:00Z`)) / 86_400_000);
}

/** Friendly label for a bare date, e.g. "Fri, Jul 18" — or, when it's the day
    after `todayISO`, "Tomorrow · Fri, Jul 18". Formatted in UTC so the weekday
    matches the calendar date exactly. */
export function friendlyLabel(iso: string, todayISO: string = chicagoTodayISO()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).formatToParts(new Date(`${iso}T12:00:00Z`));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const base = `${get("weekday")}, ${get("month")} ${get("day")}`;
  return dayDiff(iso, todayISO) === 1 ? `Tomorrow · ${base}` : base;
}

export interface QuickDate {
  /** YYYY-MM-DD (Chicago calendar date) */
  iso: string;
  /** short relative/weekday eyebrow — "TOMORROW", "SAT", … */
  eyebrow: string;
  /** compact date line — "JUL 18" */
  dateLine: string;
  /** full accessible label — "Tomorrow · Fri, Jul 18" */
  label: string;
}

/** The three default quick choices: tomorrow, +2, +3 (Chicago). */
export function quickDates(now: Date = new Date()): QuickDate[] {
  const today = chicagoTodayISO(now);
  return [1, 2, 3].map((i) => {
    const iso = addDaysISO(today, i);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).formatToParts(new Date(`${iso}T12:00:00Z`));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      iso,
      eyebrow: (i === 1 ? "Tomorrow" : get("weekday")).toUpperCase(),
      dateLine: `${get("month")} ${get("day")}`.toUpperCase(),
      label: friendlyLabel(iso, today),
    };
  });
}

export type DateRejection = "malformed" | "past" | "out-of-range";

/** Re-validatable date check, run on BOTH client and server. Rejects
    non-ISO/impossible dates, anything before Chicago today, and anything past
    the SHOWING_MAX_DAYS window — so a tampered client value is still caught. */
export function validateRequestedDay(
  day: string,
  todayISO: string = chicagoTodayISO(),
  maxDays: number = SHOWING_MAX_DAYS
): { ok: true } | { ok: false; reason: DateRejection } {
  if (!ISO_RE.test(day)) return { ok: false, reason: "malformed" };
  const t = Date.parse(`${day}T12:00:00Z`);
  if (Number.isNaN(t)) return { ok: false, reason: "malformed" };
  // reject rollovers like 2026-02-30 that a lenient parser might accept
  if (new Date(t).toISOString().slice(0, 10) !== day) return { ok: false, reason: "malformed" };
  const diff = dayDiff(day, todayISO);
  if (diff < 0) return { ok: false, reason: "past" };
  if (diff > maxDays) return { ok: false, reason: "out-of-range" };
  return { ok: true };
}
