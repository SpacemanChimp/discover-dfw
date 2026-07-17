"use client";
/* Non-obstructive HumanSearchHelp for the live search experience. Sits inline
   at the END of the results rail — never over listings or the map, and never
   auto-opens the form modal:
   - a slim pill is always available (the explicit-click path); pressing it
     opens the request modal
   - after meaningful engagement (three or more filter changes this session)
     the ask upgrades to the fuller card so it's easier to notice — still
     click-to-open, never a modal without intent
   Dismissing drops it back to the slim pill and stops future upgrades.
   Browsing never depends on any of this. */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ConversionPanel from "./ConversionPanel";

const COUNT_KEY = "ddfw.searchhelp.filters";
const DISMISS_KEY = "ddfw.searchhelp.dismissed";

export default function SearchHelpSlot({ citySlug }: { citySlug?: string | null }) {
  const sp = useSearchParams();
  const query = sp.toString();
  const [upgraded, setUpgraded] = useState(false);
  const lastQuery = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (lastQuery.current === null) {
        lastQuery.current = query; // first mount is a page view, not a filter change
        return;
      }
      if (query === lastQuery.current) return;
      lastQuery.current = query;
      const n = (Number(sessionStorage.getItem(COUNT_KEY)) || 0) + 1;
      sessionStorage.setItem(COUNT_KEY, String(n));
      if (n >= 3 && sessionStorage.getItem(DISMISS_KEY) !== "1") setUpgraded(true);
    } catch {
      /* storage blocked — the pill still works */
    }
  }, [query]);

  function dismiss() {
    setUpgraded(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!upgraded) {
    return (
      <div style={{ padding: "18px 0 8px" }}>
        <ConversionPanel intent="human-search-help" citySlug={citySlug} variant="pill" />
      </div>
    );
  }

  return (
    <div className="cv-step" style={{ padding: "18px 0 8px" }}>
      <ConversionPanel intent="human-search-help" citySlug={citySlug} />
      <button
        type="button"
        onClick={dismiss}
        className="link-underline font-mono"
        style={{ background: "none", border: "none", padding: "12px 0 0", fontSize: 9.5, fontWeight: 700, letterSpacing: ".16em", color: "rgba(29,25,19,.55)", cursor: "pointer" }}
      >
        HIDE THIS — KEEP BROWSING
      </button>
    </div>
  );
}
