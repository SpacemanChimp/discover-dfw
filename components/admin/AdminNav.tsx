/* Admin Console navigation strip — rendered by every gated admin page,
   strictly AFTER the ADMIN_EMAILS gate (it never exists for anyone
   else). Pure links: no data reads, no actions. */

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const ORANGE = "#D9481F";

const TABS: { key: string; label: string; href: string }[] = [
  { key: "console", label: "CONSOLE", href: "/admin" },
  { key: "editor", label: "EDITOR", href: "/admin/editor" },
  { key: "leads", label: "LEADS", href: "/admin/leads" },
  { key: "photos", label: "PHOTOS", href: "/admin/photos" },
  { key: "communities", label: "COMMUNITIES", href: "/admin/communities" },
  { key: "content", label: "SEO CONTENT", href: "/admin/communities?view=content" },
  { key: "newbuilds", label: "NEW BUILDS", href: "/admin/newbuilds" },
  { key: "letter", label: "THE LETTER", href: "/admin/letter" },
  { key: "growth", label: "GROWTH", href: "/admin/growth" },
];

export default function AdminNav({ current }: { current: string }) {
  return (
    <nav
      style={{
        background: INK,
        borderBottom: `2px solid ${ORANGE}`,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 18,
        flexWrap: "wrap",
      }}
    >
      <span
        className="font-mono"
        style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".26em", color: ORANGE }}
      >
        DISCOVER DFW · CONSOLE
      </span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <a
            key={t.key}
            href={t.href}
            className="font-mono"
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: ".14em",
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: 999,
              color: current === t.key ? INK : "rgba(246,241,230,.85)",
              background: current === t.key ? CREAM : "transparent",
              border: `1.5px solid ${current === t.key ? CREAM : "rgba(246,241,230,.35)"}`,
            }}
          >
            {t.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
