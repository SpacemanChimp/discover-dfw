/* Contextual conversion intents — PURE config + helpers (no React, no env,
   no server-only) so the panel engine stays thin and every rule here is
   unit-tested (scripts/tests/convert-core.test.mjs).

   Seven intents, one engine (components/convert/ConversionPanel.tsx), one
   intake door (/api/leads, type "guide") → normalized lead service → FUB.
   None of these render on public templates yet — the dev harness at
   /dev/convert (blocked in production) is the only mount point. */

export type IntentKey =
  | "build-my-shortlist"
  | "compare-this-city"
  | "curated-homes"
  | "new-build-incentives"
  | "plan-builder-tour"
  | "homeowner-equity-plan"
  | "human-search-help";

export interface IntentConfig {
  key: IntentKey;
  /** font-mono kicker, e.g. "FIELD GUIDE SERVICE" */
  kicker: string;
  headline: string;
  body: string;
  /** visible label for the required primary-request field */
  primaryLabel: string;
  /** example hint rendered UNDER the field (never placeholder-only) */
  primaryHint: string;
  /** optional second step — only the fields the intent genuinely needs */
  step2: { budget?: boolean; timeline?: boolean; compareCity?: boolean; message?: boolean };
  success: string;
}

export const INTENTS: Record<IntentKey, IntentConfig> = {
  "build-my-shortlist": {
    key: "build-my-shortlist",
    kicker: "BUILD MY SHORTLIST",
    headline: "Ninety cities is too many. Let's get you to three.",
    body: "Tell us your budget, commute, and priorities. We'll narrow North Texas to a practical shortlist.",
    primaryLabel: "What matters most",
    primaryHint: "e.g. under $550K, 30 min to DFW Airport, room for a shop",
    step2: { budget: true, timeline: true, message: true },
    success: "Shortlist request received — a local guide reads every one and replies with real candidates, not a mailing list.",
  },
  "compare-this-city": {
    key: "compare-this-city",
    kicker: "COMPARE THIS CITY",
    headline: "Torn between two towns? Put them side by side.",
    body: "Tell us what you're weighing. We'll line up prices, commutes, schools, and the trade-offs the brochures skip.",
    primaryLabel: "What you're deciding between",
    primaryHint: "e.g. here vs. Prosper — schools and yard size matter most",
    step2: { compareCity: true, budget: true, message: true },
    success: "Comparison request received — expect a straight answer about trade-offs, not a sales pitch for either town.",
  },
  "curated-homes": {
    key: "curated-homes",
    kicker: "CURATED HOMES",
    headline: "A cleaner list than the entire market.",
    body: "Want a cleaner list than the entire market? Get homes selected around your budget, location, and must-haves.",
    primaryLabel: "Your must-haves",
    primaryHint: "e.g. single story, real backyard, no busy road",
    step2: { budget: true, timeline: true, message: true },
    success: "Curation request received — a guide hand-picks against your list and sends homes worth your weekend.",
  },
  "new-build-incentives": {
    key: "new-build-incentives",
    kicker: "NEW BUILD INTEL",
    headline: "Know the incentives before you visit the models.",
    body: "Get the currently verified builder, inventory, and incentive information before visiting the models.",
    primaryLabel: "What you want to know",
    primaryHint: "e.g. current rate buydowns and which builders have spec homes",
    step2: { budget: true, timeline: true, message: true },
    success: "Request received — we'll pull what's verified right now and flag anything that changed this month.",
  },
  "plan-builder-tour": {
    key: "plan-builder-tour",
    kicker: "PLAN A BUILDER TOUR",
    headline: "One efficient route through the right models.",
    body: "Plan one efficient route through the builders and communities that fit your budget.",
    primaryLabel: "What you're building toward",
    primaryHint: "e.g. 4 bed under $500K, ready within 6 months",
    step2: { budget: true, timeline: true, message: true },
    success: "Tour request received — expect a proposed route with drive times, not a stack of brochures.",
  },
  "homeowner-equity-plan": {
    key: "homeowner-equity-plan",
    kicker: "HOMEOWNER EQUITY PLAN",
    headline: "Already own here? Do the math before you move.",
    body: "Already own here? See what your equity and timing could make possible elsewhere.",
    primaryLabel: "What you're weighing",
    primaryHint: "e.g. whether selling now covers a move up to Prosper",
    step2: { timeline: true, message: true },
    success: "Request received — a guide runs the numbers on your equity and timing before anyone talks listings.",
  },
  "human-search-help": {
    key: "human-search-help",
    kicker: "HUMAN SEARCH HELP",
    headline: "Too many results? Borrow a local brain.",
    body: "Too many results? Tell us what matters and we'll help narrow the map.",
    primaryLabel: "What matters",
    primaryHint: "e.g. quiet street, newer roof, under $450K",
    step2: { budget: true, message: true },
    success: "Got it — a human narrows the map against what you wrote and replies with a filtered view.",
  },
};

export const INTENT_KEYS = Object.keys(INTENTS) as IntentKey[];

/* ---------------- contact classification ---------------- */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One "email or mobile" field → classified server- AND client-side by the
    same rule. Mobile = 10+ digits once separators are stripped. */
export function classifyContact(raw: string): { email?: string; phone?: string } | null {
  const v = (raw || "").trim();
  if (!v) return null;
  if (EMAIL_RE.test(v)) return { email: v.toLowerCase() };
  const digits = v.replace(/[^\d]/g, "");
  if (digits.length >= 10 && digits.length <= 15 && /^[\d\s().+-]+$/.test(v)) return { phone: v };
  return null;
}

/* ---------------- client-side validation ---------------- */

export interface Step1Values {
  name: string;
  contact: string;
  primary: string;
}

export function validateStep1(v: Step1Values): Partial<Record<keyof Step1Values, string>> {
  const errors: Partial<Record<keyof Step1Values, string>> = {};
  if (!v.name.trim()) errors.name = "Add your name so the guide knows who's asking.";
  if (!classifyContact(v.contact)) errors.contact = "Enter an email address or a 10-digit mobile number.";
  if (!v.primary.trim()) errors.primary = "One line is enough — what should we work from?";
  return errors;
}

/* ---------------- submission payload ---------------- */

export interface PageContext {
  /** path + query as captured in the browser (carries utm_*) */
  sourcePage: string | null;
  referrer: string | null;
  sessionId: string | null;
  citySlug?: string | null;
  community?: string | null;
}

export interface Step2Values {
  budget?: string;
  timeline?: string;
  compareCity?: string;
  message?: string;
}

/** The exact body POSTed to /api/leads (type "guide"). Context fields ride
    along unchanged so URL + UTM attribution survives into the CRM. */
export function buildLeadBody(
  intent: IntentKey,
  step1: Step1Values,
  step2: Step2Values,
  ctx: PageContext,
  spam: { hp: string; openedAt: number }
) {
  return {
    type: "guide" as const,
    intent,
    name: step1.name.trim(),
    contact: step1.contact.trim(),
    primary: step1.primary.trim().slice(0, 600),
    budget: step2.budget?.trim().slice(0, 120) || undefined,
    timeline: step2.timeline?.trim().slice(0, 120) || undefined,
    comparingWith: step2.compareCity?.trim().slice(0, 120) || undefined,
    message: step2.message?.trim().slice(0, 2000) || undefined,
    citySlug: ctx.citySlug || undefined,
    community: ctx.community || undefined,
    sourcePage: ctx.sourcePage || undefined,
    referrer: ctx.referrer || undefined,
    sessionId: ctx.sessionId || undefined,
    hp: spam.hp,
    openedAt: spam.openedAt,
  };
}

export const TIMELINE_OPTIONS = ["0–3 months", "3–6 months", "6–12 months", "Just researching"] as const;
