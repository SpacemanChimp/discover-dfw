"use client";
import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics/track";

/* One-shot IN-VIEW tracker for newsletter signup forms: newsletter_view
   fires when the form actually scrolls into the viewport, not on mount —
   a bottom-of-page form that nobody reaches must not count as a view.
   onceKey dedupes across strict-mode remounts and route revisits. The
   `spot` (e.g. "newsletter-bottom" / "newsletter-inline") rides the
   intent-free view field via onceKey only — no per-user data. */
export function useLetterFormView(spot: string) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track("newsletter_view", { intent: "newsletter" }, `newsletter_view:${spot}`);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [spot]);
  return ref;
}
