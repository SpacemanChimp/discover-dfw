/* CI-3: renders a human-approved editorial photo into a slot, or leaves
   the surface's existing placeholder (children) untouched when no approved
   asset exists. photo_assets rows only exist after explicit human approval
   (CI-6 publish step), so this component can never show an unapproved or
   MLS image. Attribution is mandatory whenever a photo renders. */
import type { CSSProperties, ReactNode } from "react";
import type { ApprovedPhoto } from "@/lib/content/editorial-photos";

export default function EditorialPhoto({
  photo,
  priority = false,
  attributionLink = true,
  className,
  style,
  overlay,
  children,
}: {
  photo?: ApprovedPhoto;
  /* eager + high fetch priority — above-the-fold hero slots only */
  priority?: boolean;
  /* false when this photo renders INSIDE a <Link>/<a> (e.g. the homepage
     pick cards): nested anchors are invalid HTML and React's hydration
     recovery DROPS the chip from the client DOM — the attribution then
     renders as plain visible text instead. The source URL still lives in
     photo_assets.source_page_url; only the chip's clickability changes. */
  attributionLink?: boolean;
  className?: string;
  style?: CSSProperties;
  /* badges rendered over both the photo and the placeholder */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  if (!photo) {
    return (
      <div className={className} style={style}>
        {children}
        {overlay}
      </div>
    );
  }
  return (
    <div
      className={className}
      style={{ ...style, position: "relative", overflow: "hidden", padding: 0 }}
    >
      {/* plain <img>: assets are pre-sized on approval; matches the repo's
          listing-media pattern (next/image would need remote-domain config) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.publicImageUrl}
        alt={photo.altText}
        width={photo.width ?? undefined}
        height={photo.height ?? undefined}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      <span
        className="font-mono"
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          fontSize: 9,
          letterSpacing: ".14em",
          background: "rgba(29,25,19,.78)",
          color: "#F6F1E6",
          padding: "4px 9px",
          borderRadius: 6,
          maxWidth: "calc(100% - 20px)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {photo.sourcePageUrl && attributionLink ? (
          <a
            href={photo.sourcePageUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            {photo.attributionText}
          </a>
        ) : (
          photo.attributionText
        )}
      </span>
      {overlay}
    </div>
  );
}
