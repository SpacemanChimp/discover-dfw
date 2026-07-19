/* "PREVIEWING DRAFT CONTENT" banner — rendered by instrumented public
   pages ONLY when Next.js Draft Mode is enabled for the request (the
   draft cookie is issued exclusively by the admin-gated preview route).
   Fixed at the bottom so it never collides with the site's sticky navs.
   The exit link disables draft mode and returns to the editor desk. */
export default function PreviewBanner({ route }: { route: string }) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 4000,
        background: "#1D1913",
        borderTop: "3px solid #D9481F",
        color: "#F6F1E6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        flexWrap: "wrap",
        padding: "10px 16px",
      }}
    >
      <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".22em", color: "#E88D6B" }}>
        ✏ PREVIEWING DRAFT CONTENT — PUBLIC VISITORS SEE THE PUBLISHED VERSION
      </span>
      <a
        href={`/api/admin/editor/preview/exit?back=${encodeURIComponent(route)}`}
        className="font-mono"
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: ".14em",
          color: "#1D1913",
          background: "#F6F1E6",
          borderRadius: 999,
          padding: "7px 14px",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        EXIT PREVIEW → BACK TO EDITOR
      </a>
    </div>
  );
}
