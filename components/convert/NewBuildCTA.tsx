"use client";
import { useState } from "react";
import { ConversionSheet } from "./ConversionPanel";
import type { IntentKey } from "@/lib/convert/intents";

/* The new-build page's single conversion moment — a compact, full-width
   editorial BAND (not a nested card, ad, or floating pair). It sits after the
   "why buyers look here" reasons, so the buyer has read the case before being
   asked to act. Copy/type/borders match the field guide; both actions open
   the existing ConversionSheet, so intent, community/page/UTM context, spam
   protection and the normalized /api/leads → FUB pipeline are untouched.

   Community Studio (Amendment 2): the band's copy and buttons are
   parameterized so a page-specific CTA override can re-render THIS component
   with its own kicker/headline/copy/labels. Every default below is the exact
   previous hardcoded content — a call with no content props renders
   byte-for-byte what it always did. A button is either a lead intent (opens
   the sheet) or a pre-validated internal href; the sanitizer upstream is the
   only source of hrefs.

   Layout via .nb-cta-* (globals.css): a restrained two-column row on desktop
   (copy left, grouped actions right), a clean full-width stack on phones. */

export interface CtaBandButton {
  label: string;
  /** opens the existing ConversionSheet with this intent */
  intent?: IntentKey;
  /** OR navigates to a sanitizer-validated internal path */
  href?: string;
}

const PRIMARY_STYLE: React.CSSProperties = {
  background: "#C13E17",
  color: "#F6F1E6",
  border: "2px solid #C13E17",
  borderRadius: 999,
  padding: "14px 24px",
  fontWeight: 700,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  boxShadow: "0 8px 20px rgba(217,72,31,.24)",
  whiteSpace: "nowrap",
};

const SECONDARY_STYLE: React.CSSProperties = {
  background: "#F6F1E6",
  color: "#1D1913",
  border: "2px solid #1D1913",
  borderRadius: 999,
  padding: "14px 24px",
  fontWeight: 700,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default function NewBuildCTA({
  citySlug,
  community,
  kicker = "BUILDER HELP",
  heading = "Want the current builder incentive sheet?",
  body = "We’ll help you compare builder offers, available inventory, and the questions worth asking before you visit the models.",
  primary = { label: "Discover Builder Incentives", intent: "new-build-incentives" },
  secondary = { label: "Ask a Question", intent: "ask-a-question" },
}: {
  citySlug?: string | null;
  community?: string | null;
  kicker?: string;
  heading?: string;
  body?: string;
  primary?: CtaBandButton;
  /** null = no secondary button */
  secondary?: CtaBandButton | null;
}) {
  const [open, setOpen] = useState<IntentKey | null>(null);
  const action = (b: CtaBandButton, style: React.CSSProperties) =>
    b.intent ? (
      <button type="button" onClick={() => setOpen(b.intent!)} aria-haspopup="dialog" style={style}>
        {b.label}
      </button>
    ) : (
      <a href={b.href ?? "/"} style={{ ...style, display: "inline-block", textAlign: "center", textDecoration: "none" }}>
        {b.label}
      </a>
    );
  return (
    <section aria-labelledby="nb-cta-head" style={{ borderTop: "2px solid #1D1913", background: "#F6F1E6" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(36px,5vw,52px) 4vw" }}>
        <div className="nb-cta-band">
          <div className="nb-cta-copy">
            <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".24em", fontWeight: 700, color: "#C13E17" }}>
              {kicker}
            </div>
            <h3 id="nb-cta-head" className="font-serif" style={{ margin: "8px 0 0", fontWeight: 800, fontSize: "clamp(20px,2.4vw,25px)", lineHeight: 1.15 }}>
              {heading}
            </h3>
            <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(29,25,19,.7)", maxWidth: 560 }}>
              {body}
            </p>
          </div>
          <div className="nb-cta-actions">
            {action(primary, PRIMARY_STYLE)}
            {secondary && action(secondary, SECONDARY_STYLE)}
          </div>
        </div>
      </div>
      {open && (
        <ConversionSheet intent={open} citySlug={citySlug} community={community} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
