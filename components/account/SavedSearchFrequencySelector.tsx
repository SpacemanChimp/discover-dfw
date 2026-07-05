"use client";
import type { SavedSearchFrequency } from "@/lib/mls/types";

const OPTIONS: { value: SavedSearchFrequency; label: string }[] = [
  { value: "instant", label: "INSTANT" },
  { value: "daily", label: "DAILY" },
  { value: "weekly", label: "WEEKLY" },
  { value: "off", label: "OFF" },
];

/* Alert cadence pills for a standing order. Preference only for now —
   search alert emails arrive in a later phase. */
export default function SavedSearchFrequencySelector({
  value,
  onChange,
}: {
  value: SavedSearchFrequency;
  onChange: (f: SavedSearchFrequency) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Alert frequency"
      style={{
        display: "inline-flex",
        border: "1.5px solid rgba(29,25,19,.4)",
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => !active && onChange(o.value)}
            className="font-mono"
            style={{
              border: "none",
              padding: "6px 10px",
              fontSize: 8,
              fontWeight: active ? 700 : 400,
              letterSpacing: ".12em",
              background: active ? "#1D1913" : "transparent",
              color: active ? "#F6F1E6" : "rgba(29,25,19,.6)",
              cursor: active ? "default" : "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
