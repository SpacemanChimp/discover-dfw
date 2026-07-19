"use client";
import { useState } from "react";
import { INTENTS, type IntentKey } from "@/lib/convert/intents";
import { ConversionSheet } from "./ConversionPanel";

/* The one CTA a public page gets, in the LISTING-PAGE treatment: a primary
   orange pill and one smaller adjacent secondary pill — not a standalone
   marketing card. Both open the existing ConversionSheet, so lead intent,
   page/city/community context, UTM capture, validation, spam protection and
   the normalized /api/leads submission are untouched.

   Responsive via .cta-duo (globals.css): side-by-side on wider screens, a
   clean stack on phones. No nested cards. */
export default function ConversionDuo({
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  primaryHref,
  secondaryHref,
  citySlug,
  community,
}: {
  primary: IntentKey;
  /** omit for a single-action CTA */
  secondary?: IntentKey;
  /** override the intent's own cta text (e.g. "Discover Builder Incentives") */
  primaryLabel?: string;
  secondaryLabel?: string;
  /** Community Studio CTA override: a sanitizer-validated internal path —
      the pill becomes a link instead of opening the sheet. The sanitizer in
      lib/editor/blocks.ts is the only source of these hrefs. */
  primaryHref?: string;
  secondaryHref?: string;
  citySlug?: string | null;
  community?: string | null;
}) {
  const [open, setOpen] = useState<IntentKey | null>(null);
  const primaryStyle: React.CSSProperties = {
    background: "#C13E17",
    color: "#F6F1E6",
    border: "2px solid #C13E17",
    borderRadius: 999,
    padding: "15px 26px",
    textAlign: "center",
    fontWeight: 700,
    fontSize: 14,
    boxShadow: "0 10px 22px rgba(217,72,31,.28)",
    cursor: "pointer",
    fontFamily: "inherit",
  };
  const secondaryStyle: React.CSSProperties = {
    border: "2px solid #1D1913",
    borderRadius: 999,
    padding: "15px 26px",
    textAlign: "center",
    fontWeight: 700,
    fontSize: 14,
    background: "#F6F1E6",
    color: "#1D1913",
    cursor: "pointer",
    fontFamily: "inherit",
  };
  return (
    <>
      <div className="cta-duo">
        {primaryHref ? (
          <a href={primaryHref} className="btn-primary" style={{ ...primaryStyle, display: "inline-block", textDecoration: "none" }}>
            {primaryLabel ?? INTENTS[primary].cta}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(primary)}
            aria-haspopup="dialog"
            className="btn-primary"
            style={primaryStyle}
          >
            {primaryLabel ?? INTENTS[primary].cta}
          </button>
        )}
        {secondaryHref ? (
          <a href={secondaryHref} style={{ ...secondaryStyle, display: "inline-block", textDecoration: "none" }}>
            {secondaryLabel ?? (secondary ? INTENTS[secondary].cta : "")}
          </a>
        ) : (
          secondary && (
            <button
              type="button"
              onClick={() => setOpen(secondary)}
              aria-haspopup="dialog"
              style={secondaryStyle}
            >
              {secondaryLabel ?? INTENTS[secondary].cta}
            </button>
          )
        )}
      </div>
      {open && (
        <ConversionSheet
          intent={open}
          citySlug={citySlug}
          community={community}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
