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

   Layout via .nb-cta-* (globals.css): a restrained two-column row on desktop
   (copy left, grouped actions right), a clean full-width stack on phones. */
export default function NewBuildCTA({
  citySlug,
  community,
}: {
  citySlug?: string | null;
  community?: string | null;
}) {
  const [open, setOpen] = useState<IntentKey | null>(null);
  return (
    <section aria-labelledby="nb-cta-head" style={{ borderTop: "2px solid #1D1913", background: "#F6F1E6" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(36px,5vw,52px) 4vw" }}>
        <div className="nb-cta-band">
          <div className="nb-cta-copy">
            <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".24em", fontWeight: 700, color: "#C13E17" }}>
              BUILDER HELP
            </div>
            <h3 id="nb-cta-head" className="font-serif" style={{ margin: "8px 0 0", fontWeight: 800, fontSize: "clamp(20px,2.4vw,25px)", lineHeight: 1.15 }}>
              Want the current builder incentive sheet?
            </h3>
            <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(29,25,19,.7)", maxWidth: 560 }}>
              We&rsquo;ll help you compare builder offers, available inventory, and the questions worth asking before you visit the models.
            </p>
          </div>
          <div className="nb-cta-actions">
            <button
              type="button"
              onClick={() => setOpen("new-build-incentives")}
              aria-haspopup="dialog"
              style={{
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
              }}
            >
              Discover Builder Incentives
            </button>
            <button
              type="button"
              onClick={() => setOpen("ask-a-question")}
              aria-haspopup="dialog"
              style={{
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
              }}
            >
              Ask a Question
            </button>
          </div>
        </div>
      </div>
      {open && (
        <ConversionSheet intent={open} citySlug={citySlug} community={community} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
