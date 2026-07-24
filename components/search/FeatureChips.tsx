import Link from "next/link";
import {
  FEATURES,
  FEATURE_SLUGS,
  featurePath,
  publishedFeaturesForCity,
} from "@/lib/mls/feature-search";

/* Compact discovery chips for the feature searches — the one shared band
   used by the homepage hero ("Search by what matters"), the /homes toolbar
   strip ("Popular searches"), and city pages (their published feature
   links only). Plain crawlable links in the field-guide voice; no cards,
   no imagery. */
export default function FeatureChips({
  label,
  citySlug,
  cityName,
  dark = false,
}: {
  label: string;
  /** When set: ONLY this city's registry-published feature searches (≤4). */
  citySlug?: string;
  cityName?: string;
  dark?: boolean;
}) {
  const ink = dark ? "#F6F1E6" : "#1D1913";
  const chip: React.CSSProperties = {
    border: `1.5px solid ${dark ? "rgba(246,241,230,.4)" : "rgba(29,25,19,.4)"}`,
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: ".12em",
    textDecoration: "none",
    color: ink,
    whiteSpace: "nowrap",
  };

  const links: { href: string; text: string }[] = citySlug
    ? publishedFeaturesForCity(citySlug).map((f) => ({
        href: featurePath(f, citySlug),
        text: `${(cityName ?? citySlug).toUpperCase()} ${FEATURES[f].chip}`,
      }))
    : [
        ...FEATURE_SLUGS.map((f) => ({ href: featurePath(f), text: FEATURES[f].chip })),
        { href: "/land", text: "LAND" },
        { href: "/new-builds", text: "NEW BUILDS" },
      ];
  if (!links.length) return null;

  return (
    <nav
      aria-label={label}
      className="feature-chips"
      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}
    >
      <span
        className="font-mono"
        style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".2em", color: dark ? "rgba(246,241,230,.6)" : "rgba(29,25,19,.55)", whiteSpace: "nowrap" }}
      >
        {label}
      </span>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="font-mono feature-chip" style={chip}>
          {l.text}
        </Link>
      ))}
    </nav>
  );
}
