import Link from "next/link";

/* Prev/next pagination for search results — plain links so pages stay
   crawlable and back-button friendly. page=1 keeps a clean URL. */
export default function Pager({
  total,
  page,
  pageSize,
  basePath,
  qs,
}: {
  total: number;
  page: number;
  pageSize: number;
  /** e.g. "/homes" or "/city/denton/homes" */
  basePath: string;
  /** current filters, serialized WITHOUT the page param */
  qs: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams(qs);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const arrow = (label: string, target: number, enabled: boolean) =>
    enabled ? (
      <Link
        href={href(target)}
        className="font-mono"
        style={{
          border: "1.5px solid #1D1913",
          borderRadius: 999,
          padding: "9px 16px",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: ".14em",
          color: "#1D1913",
          textDecoration: "none",
          background: "#FBF7EE",
        }}
      >
        {label}
      </Link>
    ) : (
      <span
        className="font-mono"
        style={{
          border: "1.5px solid rgba(29,25,19,.25)",
          borderRadius: 999,
          padding: "9px 16px",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: ".14em",
          color: "rgba(29,25,19,.3)",
        }}
      >
        {label}
      </span>
    );

  return (
    <nav
      aria-label="Search result pages"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "10px 0 4px" }}
    >
      {arrow("← PREV", page - 1, page > 1)}
      <span className="font-mono" style={{ fontSize: 9, letterSpacing: ".18em", color: "rgba(29,25,19,.55)" }}>
        PAGE {page} OF {pages}
      </span>
      {arrow("NEXT →", page + 1, page < pages)}
    </nav>
  );
}
