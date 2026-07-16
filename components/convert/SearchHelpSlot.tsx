"use client";
/* Non-obstructive HumanSearchHelp mount for the live search experience.
   Sits inline at the END of the results rail — never over listings or the
   map — and the form itself does not appear immediately:
   - always available behind an explicit click (collapsed pill), and
   - auto-expands only after meaningful engagement: three or more filter
     changes in this session (tracked via the query string, sessionStorage).
   Dismissing collapses it again and stops future auto-expands. Browsing
   never depends on it. */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ConversionPanel from "./ConversionPanel";

const COUNT_KEY = "ddfw.searchhelp.filters";
const DISMISS_KEY = "ddfw.searchhelp.dismissed";

export default function SearchHelpSlot({ citySlug }: { citySlug?: string | null }) {
  const sp = useSearchParams();
  const query = sp.toString();
  const [open, setOpen] = useState(false);
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
      if (n >= 3 && sessionStorage.getItem(DISMISS_KEY) !== "1") setOpen(true);
    } catch {
      /* storage blocked — explicit click still works */
    }
  }, [query]);

  function dismiss() {
    setOpen(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!open) {
    return (
      <div style={{ padding: "18px 0 8px" }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="link-underline font-mono"
          style={{
            background: "none",
            border: "1.5px dashed rgba(217,72,31,.5)",
            borderRadius: 999,
            padding: "11px 18px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".18em",
            color: "#C13E17",
            cursor: "pointer",
          }}
        >
          TOO MANY RESULTS? GET HUMAN HELP →
        </button>
      </div>
    );
  }

  return (
    <div className="cv-step" style={{ padding: "18px 0 8px" }}>
      <ConversionPanel intent="human-search-help" citySlug={citySlug} />
      <button
        type="button"
        onClick={dismiss}
        aria-expanded={true}
        className="link-underline font-mono"
        style={{
          background: "none",
          border: "none",
          padding: "12px 0 0",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: ".16em",
          color: "rgba(29,25,19,.55)",
          cursor: "pointer",
        }}
      >
        HIDE THIS — KEEP BROWSING
      </button>
    </div>
  );
}
