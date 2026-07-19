/* Structured-JSON → JSX renderer for published editor content. The ONLY
   way editor content reaches a public page. Renders the sanitized node
   set and nothing else — no dangerouslySetInnerHTML, no raw HTML pass-
   through anywhere. Unknown nodes render nothing.

   Images render as <figure> with required alt and attribution; an image
   is a block node (never inside a link mark), so an attributed image can
   never produce a nested anchor. */
import type { PMNode, ResolvedRegion } from "./doc";

function Marks({ node, children }: { node: PMNode; children: React.ReactNode }) {
  let out = children;
  for (const m of node.marks ?? []) {
    if (m.type === "bold") out = <strong>{out}</strong>;
    else if (m.type === "italic") out = <em>{out}</em>;
    else if (m.type === "link") {
      const href = String(m.attrs?.href ?? "");
      const external = /^https?:\/\//i.test(href);
      out = external ? (
        <a href={href} rel="noopener noreferrer" target="_blank">{out}</a>
      ) : (
        <a href={href}>{out}</a>
      );
    }
  }
  return <>{out}</>;
}

function Inline({ nodes }: { nodes?: PMNode[] }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => {
        if (n.type === "text") {
          return (
            <Marks key={i} node={n}>
              {n.text}
            </Marks>
          );
        }
        if (n.type === "hardBreak") return <br key={i} />;
        return null;
      })}
    </>
  );
}

function Block({ node }: { node: PMNode }) {
  switch (node.type) {
    case "paragraph":
      return (
        <p>
          <Inline nodes={node.content} />
        </p>
      );
    case "heading": {
      const level = Number(node.attrs?.level);
      if (level === 2)
        return (
          <h2 className="font-serif">
            <Inline nodes={node.content} />
          </h2>
        );
      if (level === 3)
        return (
          <h3 className="font-serif">
            <Inline nodes={node.content} />
          </h3>
        );
      return null;
    }
    case "bulletList":
      return (
        <ul>
          {(node.content ?? []).map((li, i) => (
            <li key={i}>
              {(li.content ?? []).map((c, j) => (
                <Block key={j} node={c} />
              ))}
            </li>
          ))}
        </ul>
      );
    case "orderedList":
      return (
        <ol>
          {(node.content ?? []).map((li, i) => (
            <li key={i}>
              {(li.content ?? []).map((c, j) => (
                <Block key={j} node={c} />
              ))}
            </li>
          ))}
        </ol>
      );
    case "blockquote":
      return (
        <blockquote>
          {(node.content ?? []).map((c, i) => (
            <Block key={i} node={c} />
          ))}
        </blockquote>
      );
    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "");
      const caption = String(node.attrs?.caption ?? "");
      const attribution = String(node.attrs?.attribution ?? "");
      if (!src) return null;
      return (
        <figure className="ed-figure">
          {/* CDN-served editorial image; sizing handled by .ed-rich CSS */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} loading="lazy" decoding="async" />
          {(caption || attribution) && (
            <figcaption>
              {caption}
              {caption && attribution ? " · " : ""}
              {attribution && <span className="font-mono ed-attribution">{attribution}</span>}
            </figcaption>
          )}
        </figure>
      );
    }
    default:
      return null;
  }
}

/** Render a sanitized richtext document with the site's editorial rhythm
    (.ed-rich rules live in globals.css). `region` marks the container for
    the Visual Builder canvas (data-bb-region) — pages pass it ONLY in
    builder mode, so public HTML never carries the marker. */
export function RichDoc({ doc, region }: { doc: unknown; region?: string }) {
  const d = doc as PMNode;
  if (!d || d.type !== "doc" || !Array.isArray(d.content)) return null;
  return (
    <div className="ed-rich" data-bb-region={region}>
      {d.content.map((n, i) => (
        <Block key={i} node={n} />
      ))}
    </div>
  );
}

/** Plain-text region value ('text' content type). */
export function textValue(region: ResolvedRegion | undefined): string | null {
  if (!region || region.contentType !== "text") return null;
  const v = (region.json as { attrs?: { value?: unknown } })?.attrs?.value;
  return typeof v === "string" && v.trim() ? v : null;
}

function plainTextOf(n: PMNode): string {
  if (n.type === "text") return n.text ?? "";
  return (n.content ?? []).map(plainTextOf).join(" ");
}

/** When a richtext override is EXACTLY one bullet list, return its items'
    plain text — lets templates keep their existing card/list design for
    amenities and buyer notes. Anything richer renders via RichDoc. */
export function bulletTexts(doc: unknown): string[] | null {
  const d = doc as PMNode;
  if (!d || d.type !== "doc" || !Array.isArray(d.content)) return null;
  if (d.content.length !== 1 || d.content[0].type !== "bulletList") return null;
  const texts = (d.content[0].content ?? []).map((li) => plainTextOf(li).replace(/\s+/g, " ").trim()).filter(Boolean);
  return texts.length ? texts : null;
}

/** FAQ items ('faq' content type) — the SAME array must drive both the
    visible FAQ block and FAQPage JSON-LD, so they can never diverge. */
export function faqItems(region: ResolvedRegion | undefined): { q: string; a: string }[] | null {
  if (!region || region.contentType !== "faq") return null;
  const items = (region.json as { attrs?: { items?: unknown } })?.attrs?.items;
  if (!Array.isArray(items) || !items.length) return null;
  const out = items
    .map((it) => ({ q: String((it as { q?: unknown }).q ?? ""), a: String((it as { a?: unknown }).a ?? "") }))
    .filter((it) => it.q && it.a);
  return out.length ? out : null;
}
