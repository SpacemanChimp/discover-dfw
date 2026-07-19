"use client";
/* Visual Builder canvas runtime — runs INSIDE the builder's same-origin
   canvas frame, and ONLY there. Rendered exclusively by applyLayout in
   builder mode (Draft Mode + the admin-issued __bb cookie), so it can
   never reach an anonymous visitor.

   Duties:
     · strict postMessage bridge to the admin shell (parseShellMsg; the
       shell validates our messages with parseCanvasMsg — same-origin,
       known-source, known-shape only)
     · hover/selection overlays with labels, lock explanations, and the
       allowed actions for each entry
     · drag-to-reorder on the real page with an insertion line + autoscroll,
       and plus buttons between entries for block insertion
     · inline text editing: plaintext fields and rich fields/regions with a
       small formatting toolbar (the shell converts committed HTML back to
       the sanitized document format; the server re-sanitizes on save)
     · DOM application of shell ops (order/hide/replace/insert/remove) so
       draft changes appear immediately without leaving the builder

   Everything lives outside React's tree (an overlay root we own), so the
   page's own hydrated components are never fought over. */
import { useEffect } from "react";
import {
  BB_NS,
  parseShellMsg,
  type CanvasEntryMeta,
  type CanvasMsg,
} from "@/lib/editor/bridge-protocol";

const INK = "#1D1913";
const CREAM = "#F6F1E6";
const ORANGE = "#D9481F";

const OVERLAY_CSS = `
.bbov-root{position:absolute;top:0;left:0;width:100%;pointer-events:none;z-index:2147483000;}
.bbov-box{position:absolute;pointer-events:none;border-radius:4px;}
.bbov-hover{outline:1.5px dashed rgba(29,25,19,.5);outline-offset:-1.5px;}
.bbov-sel{outline:2.5px solid ${ORANGE};outline-offset:-2.5px;}
.bbov-chip{position:absolute;display:flex;align-items:center;gap:6px;pointer-events:auto;
  background:${INK};color:${CREAM};border-radius:7px;padding:4px 8px;font:700 11px/1.4 ui-monospace,Menlo,Consolas,monospace;
  letter-spacing:.06em;white-space:nowrap;box-shadow:0 4px 14px rgba(29,25,19,.35);}
.bbov-chip button{border:none;background:none;color:${CREAM};cursor:pointer;font:inherit;font-size:12px;padding:1px 3px;border-radius:4px;}
.bbov-chip button:hover{background:rgba(246,241,230,.18);}
.bbov-chip .bbov-danger{color:#F1A08A;}
.bbov-chip .bbov-handle{cursor:grab;font-size:13px;}
.bbov-lock{color:#E8B34B;cursor:help;}
.bbov-plus{position:absolute;pointer-events:auto;display:flex;align-items:center;justify-content:center;
  width:26px;height:26px;border-radius:999px;background:${ORANGE};color:${CREAM};border:2px solid ${CREAM};
  font:900 15px/1 ui-monospace,monospace;cursor:pointer;box-shadow:0 3px 10px rgba(29,25,19,.4);transform:translate(-50%,-50%);}
.bbov-plus:hover{filter:brightness(1.08);}
.bbov-line{position:absolute;left:0;width:100%;height:0;border-top:3px solid ${ORANGE};pointer-events:none;}
.bbov-line::before{content:"";position:absolute;left:8px;top:-6px;width:9px;height:9px;border-radius:999px;background:${ORANGE};}
.bbov-toolbar{position:absolute;display:flex;gap:2px;pointer-events:auto;background:${INK};border-radius:8px;padding:4px;
  box-shadow:0 6px 18px rgba(29,25,19,.4);}
.bbov-toolbar button{border:none;background:none;color:${CREAM};cursor:pointer;font:700 11.5px/1 ui-monospace,monospace;
  padding:5px 7px;border-radius:5px;min-width:26px;}
.bbov-toolbar button:hover{background:rgba(246,241,230,.18);}
.bbov-toolbar .bbov-done{background:${ORANGE};}
[data-bb-editing]{outline:2px solid ${ORANGE} !important;outline-offset:2px;border-radius:3px;
  box-shadow:0 0 0 6px rgba(217,72,31,.12);caret-color:${ORANGE};}
[data-bb-editing]:focus{outline:2px solid ${ORANGE} !important;}
.bbov-ghost{opacity:.45 !important;}
@media (prefers-reduced-motion: no-preference){
  .bbov-box{transition:top .08s ease,left .08s ease,width .08s ease,height .08s ease;}
}
`;

export default function BuilderBridge() {
  useEffect(() => {
    // top-level loads (e.g. an admin opening a page while the builder cookie
    // lingers) get NO overlays and NO bridge — the runtime is frame-only
    if (window.parent === window) return;
    const origin = window.location.origin;
    const parent = window.parent;

    const post = (msg: CanvasMsg) => parent.postMessage(msg, origin);

    /* ------------------------------------------------------------- state */
    const metas = new Map<string, CanvasEntryMeta>();
    let selectedId: string | null = null;
    let hoverId: string | null = null;
    let overlaysOn = true;
    let editing: {
      el: HTMLElement;
      kind: "plain" | "rich" | "region";
      id?: string;
      field?: string;
      region?: string;
      original: string;
      regionOriginalSent: boolean;
    } | null = null;
    let dragging: { id: string; startY: number; gap: number | null; active: boolean } | null = null;
    let errorsSent = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const wrappers = () => Array.from(document.querySelectorAll<HTMLElement>("[data-bb-id]"));
    const wrapperOf = (id: string) => document.querySelector<HTMLElement>(`[data-bb-id="${CSS.escape(id)}"]`);
    const orderIds = () => wrappers().map((w) => w.getAttribute("data-bb-id")!).filter(Boolean);

    /* ----------------------------------------------------------- overlay */
    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.className = "bbov-root";
    root.setAttribute("data-bb-overlay", "1");
    document.body.appendChild(root);

    const hoverBox = document.createElement("div");
    hoverBox.className = "bbov-box bbov-hover";
    const selBox = document.createElement("div");
    selBox.className = "bbov-box bbov-sel";
    const chip = document.createElement("div");
    chip.className = "bbov-chip";
    const plusTop = document.createElement("button");
    plusTop.className = "bbov-plus";
    plusTop.textContent = "+";
    plusTop.title = "Insert a block here";
    const plusBottom = document.createElement("button");
    plusBottom.className = "bbov-plus";
    plusBottom.textContent = "+";
    plusBottom.title = "Insert a block here";
    const insLine = document.createElement("div");
    insLine.className = "bbov-line";
    const toolbar = document.createElement("div");
    toolbar.className = "bbov-toolbar";
    for (const el of [hoverBox, selBox, chip, plusTop, plusBottom, insLine, toolbar]) {
      el.style.display = "none";
      root.appendChild(el);
    }

    const place = (box: HTMLElement, r: DOMRect) => {
      box.style.top = `${r.top + window.scrollY}px`;
      box.style.left = `${r.left + window.scrollX}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      box.style.display = "block";
    };

    const chipFor = (id: string) => {
      const m = metas.get(id);
      if (!m) return;
      chip.innerHTML = "";
      if (m.movable) {
        const h = document.createElement("button");
        h.className = "bbov-handle";
        h.textContent = "⠿";
        h.title = "Drag to reorder (or use ↑/↓ with the section selected)";
        h.setAttribute("aria-label", "Drag to reorder");
        h.addEventListener("pointerdown", (e) => startDrag(e, id));
        chip.appendChild(h);
      }
      const label = document.createElement("span");
      label.textContent = m.label.toUpperCase();
      chip.appendChild(label);
      if (m.locked || m.required) {
        const lock = document.createElement("span");
        lock.className = "bbov-lock";
        lock.textContent = "🔒";
        lock.title = m.required
          ? "Required — carries the page H1, search, or compliance content. It cannot be hidden or removed."
          : "Protected — live data and plumbing are locked. Placement and safe settings only.";
        chip.appendChild(lock);
      }
      const btn = (txt: string, title: string, fn: () => void, danger = false) => {
        const b = document.createElement("button");
        b.textContent = txt;
        b.title = title;
        if (danger) b.className = "bbov-danger";
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          fn();
        });
        chip.appendChild(b);
      };
      btn("✎", "Edit settings (opens the right panel)", () => {
        setSelected(id);
        post({ ns: BB_NS, t: "select", id });
      });
      if (m.hideable) btn(m.hidden ? "🚫" : "👁", m.hidden ? "Show" : "Hide", () => post({ ns: BB_NS, t: "action", id, action: m.hidden ? "show" : "hide" }));
      if (m.kind === "block") {
        btn("⧉", "Duplicate", () => post({ ns: BB_NS, t: "action", id, action: "duplicate" }));
        btn("📋", "Copy (paste from the Blocks tab)", () => post({ ns: BB_NS, t: "action", id, action: "copy" }));
      }
      if (m.deletable) btn("✕", "Delete block", () => post({ ns: BB_NS, t: "action", id, action: "delete" }), true);
    };

    const refresh = () => {
      if (!overlaysOn) {
        for (const el of [hoverBox, selBox, chip, plusTop, plusBottom]) el.style.display = "none";
        return;
      }
      const selW = selectedId ? wrapperOf(selectedId) : null;
      if (selW) {
        const r = selW.getBoundingClientRect();
        place(selBox, r);
        chipFor(selectedId!);
        chip.style.top = `${Math.max(r.top + window.scrollY - 30, window.scrollY + 4)}px`;
        chip.style.left = `${r.left + window.scrollX + 8}px`;
        chip.style.display = "flex";
        const idx = orderIds().indexOf(selectedId!);
        plusTop.style.top = `${r.top + window.scrollY}px`;
        plusTop.style.left = `${r.left + window.scrollX + r.width / 2}px`;
        plusTop.style.display = "flex";
        plusTop.onclick = () => post({ ns: BB_NS, t: "insertAt", index: idx });
        plusBottom.style.top = `${r.bottom + window.scrollY}px`;
        plusBottom.style.left = `${r.left + window.scrollX + r.width / 2}px`;
        plusBottom.style.display = "flex";
        plusBottom.onclick = () => post({ ns: BB_NS, t: "insertAt", index: idx + 1 });
      } else {
        selBox.style.display = "none";
        if (!hoverId) {
          chip.style.display = "none";
          plusTop.style.display = "none";
          plusBottom.style.display = "none";
        }
      }
      const hovW = hoverId && hoverId !== selectedId ? wrapperOf(hoverId) : null;
      if (hovW) {
        const r = hovW.getBoundingClientRect();
        place(hoverBox, r);
        if (!selW) {
          chipFor(hoverId!);
          chip.style.top = `${Math.max(r.top + window.scrollY - 30, window.scrollY + 4)}px`;
          chip.style.left = `${r.left + window.scrollX + 8}px`;
          chip.style.display = "flex";
        }
      } else {
        hoverBox.style.display = "none";
      }
    };

    let rafPending = false;
    const scheduleRefresh = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        refresh();
      });
    };

    const setSelected = (id: string | null) => {
      selectedId = id;
      scheduleRefresh();
    };

    /* -------------------------------------------------------------- drag */
    const startDrag = (e: PointerEvent, id: string) => {
      const m = metas.get(id);
      if (!m?.movable) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = { id, startY: e.clientY, gap: null, active: false };
      const move = (ev: PointerEvent) => {
        if (!dragging) return;
        if (!dragging.active && Math.abs(ev.clientY - dragging.startY) < 6) return;
        dragging.active = true;
        wrapperOf(id)?.classList.add("bbov-ghost");
        // nearest gap by wrapper midpoints
        const ws = wrappers();
        const y = ev.clientY + window.scrollY;
        let gap = ws.length;
        for (let i = 0; i < ws.length; i++) {
          const r = ws[i].getBoundingClientRect();
          const mid = r.top + window.scrollY + r.height / 2;
          if (y < mid) {
            gap = i;
            break;
          }
        }
        dragging.gap = gap;
        const anchor = ws[Math.min(gap, ws.length - 1)];
        if (anchor) {
          const r = anchor.getBoundingClientRect();
          insLine.style.top = `${(gap < ws.length ? r.top : r.bottom) + window.scrollY - 1}px`;
          insLine.style.display = "block";
        }
        // autoscroll near the frame edges
        if (ev.clientY < 90) window.scrollBy(0, -16);
        else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 16);
        scheduleRefresh();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        insLine.style.display = "none";
        wrapperOf(id)?.classList.remove("bbov-ghost");
        if (dragging?.active && dragging.gap !== null) {
          const ws = wrappers();
          const from = ws.findIndex((w) => w.getAttribute("data-bb-id") === id);
          let to = dragging.gap;
          if (from >= 0 && to !== from && to !== from + 1) {
            const node = ws[from];
            const ref = to >= ws.length ? null : ws[to];
            node.parentNode?.insertBefore(node, ref);
            post({ ns: BB_NS, t: "reorder", ids: orderIds(), moved: id });
          }
        }
        dragging = null;
        scheduleRefresh();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };

    /* ----------------------------------------------------- inline editing */
    const endEdit = (commit: boolean) => {
      if (!editing) return;
      const ed = editing;
      editing = null;
      toolbar.style.display = "none";
      ed.el.removeAttribute("contenteditable");
      ed.el.removeAttribute("data-bb-editing");
      if (!commit) {
        if (ed.kind === "plain") ed.el.textContent = ed.original;
        else ed.el.innerHTML = ed.original;
        return;
      }
      if (ed.kind === "plain" && ed.id && ed.field) {
        post({ ns: BB_NS, t: "field", id: ed.id, field: ed.field, value: ed.el.textContent ?? "" });
      } else if (ed.kind === "rich" && ed.id && ed.field) {
        const rich = ed.el.querySelector(".ed-rich") ?? ed.el;
        post({ ns: BB_NS, t: "rich", id: ed.id, field: ed.field, html: rich.innerHTML });
      } else if (ed.kind === "region" && ed.region) {
        const html = ed.el.classList.contains("ed-rich") ? ed.el.innerHTML : ed.el.outerHTML;
        post({ ns: BB_NS, t: "region", region: ed.region, html, original: ed.regionOriginalSent ? null : ed.original });
      }
    };

    const showToolbar = (el: HTMLElement) => {
      toolbar.innerHTML = "";
      const cmd = (txt: string, title: string, fn: () => void, cls?: string) => {
        const b = document.createElement("button");
        b.textContent = txt;
        b.title = title;
        if (cls) b.className = cls;
        b.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          fn();
        });
        toolbar.appendChild(b);
      };
      cmd("B", "Bold", () => document.execCommand("bold"));
      cmd("I", "Italic", () => document.execCommand("italic"));
      cmd("H2", "Heading 2", () => document.execCommand("formatBlock", false, "h2"));
      cmd("H3", "Heading 3", () => document.execCommand("formatBlock", false, "h3"));
      cmd("¶", "Paragraph", () => document.execCommand("formatBlock", false, "p"));
      cmd("•", "Bullet list", () => document.execCommand("insertUnorderedList"));
      cmd("1.", "Numbered list", () => document.execCommand("insertOrderedList"));
      cmd("❝", "Quote", () => document.execCommand("formatBlock", false, "blockquote"));
      cmd("🔗", "Link (https://… or a site path like /land)", () => {
        const href = window.prompt("Link URL (https://… or a site path like /land):", "");
        if (!href) return;
        const ok = /^https:\/\/[^\s]+$/i.test(href) || (/^\/[^\s]*$/.test(href) && !/^\/(admin|account|api|auth)(\/|$)/.test(href));
        if (!ok) {
          window.alert("Only https:// links or site paths are allowed (never admin/account/api/auth).");
          return;
        }
        document.execCommand("createLink", false, href);
      });
      cmd("✓ DONE", "Finish editing (Esc cancels)", () => endEdit(true), "bbov-done");
      const r = el.getBoundingClientRect();
      toolbar.style.top = `${Math.max(r.top + window.scrollY - 40, window.scrollY + 4)}px`;
      toolbar.style.left = `${r.left + window.scrollX}px`;
      toolbar.style.display = "flex";
    };

    const beginEdit = (el: HTMLElement, kind: "plain" | "rich" | "region", info: { id?: string; field?: string; region?: string }) => {
      if (editing) endEdit(true);
      const original = kind === "plain" ? (el.textContent ?? "") : kind === "region" && !el.classList.contains("ed-rich") ? el.outerHTML : el.innerHTML;
      editing = { el, kind, ...info, original, regionOriginalSent: false };
      el.setAttribute("contenteditable", kind === "plain" ? "plaintext-only" : "true");
      if (el.getAttribute("contenteditable") !== "plaintext-only" && kind === "plain") {
        el.setAttribute("contenteditable", "true"); // browser without plaintext-only support
      }
      el.setAttribute("data-bb-editing", "1");
      el.focus();
      if (kind !== "plain") showToolbar(el);
      // caret at click point is preserved by the browser on dblclick
    };

    /* ------------------------------------------------------ DOM listeners */
    const onPointerMove = (e: PointerEvent) => {
      if (dragging?.active || editing) return;
      const t = e.target as HTMLElement;
      if (root.contains(t)) return;
      const w = t.closest?.("[data-bb-id]") as HTMLElement | null;
      const id = w?.getAttribute("data-bb-id") ?? null;
      if (id !== hoverId) {
        hoverId = id;
        scheduleRefresh();
      }
    };

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (root.contains(t)) return;
      // navigation containment: the canvas is an editing surface — links and
      // form controls must never navigate it away or submit anything
      const a = t.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a) {
        e.preventDefault();
        e.stopPropagation();
        post({ ns: BB_NS, t: "navigate", href: a.getAttribute("href") ?? "" });
      }
      if (editing) {
        if (!editing.el.contains(t) && !toolbar.contains(t)) endEdit(true);
        else return;
      }
      const w = t.closest?.("[data-bb-id]") as HTMLElement | null;
      const id = w?.getAttribute("data-bb-id") ?? null;
      setSelected(id);
      post({ ns: BB_NS, t: "select", id });
    };

    const onDblClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (root.contains(t)) return;
      // 0018 content region (code fallback or override)
      const regionEl = t.closest?.("[data-bb-region]") as HTMLElement | null;
      if (regionEl) {
        e.preventDefault();
        beginEdit(regionEl, "region", { region: regionEl.getAttribute("data-bb-region") ?? "" });
        return;
      }
      const fieldEl = t.closest?.("[data-bb-field]") as HTMLElement | null;
      if (!fieldEl) return;
      const w = fieldEl.closest("[data-bb-id]") as HTMLElement | null;
      const id = w?.getAttribute("data-bb-id");
      const field = fieldEl.getAttribute("data-bb-field")!;
      const m = id ? metas.get(id) : null;
      const fm = m?.fields.find((x) => x.field === field);
      if (!id || !fm) return;
      e.preventDefault();
      setSelected(id);
      post({ ns: BB_NS, t: "select", id });
      beginEdit(fieldEl, fm.kind, { id, field });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (editing) {
        if (e.key === "Escape") {
          e.preventDefault();
          endEdit(false);
        } else if (e.key === "Enter" && editing.kind === "plain") {
          e.preventDefault();
          endEdit(true);
        }
        return;
      }
      if (!selectedId) return;
      const m = metas.get(selectedId);
      if (e.key === "Escape") {
        setSelected(null);
        post({ ns: BB_NS, t: "select", id: null });
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && m?.movable) {
        e.preventDefault();
        const ws = wrappers();
        const from = ws.findIndex((w) => w.getAttribute("data-bb-id") === selectedId);
        const to = e.key === "ArrowUp" ? from - 1 : from + 1;
        if (from < 0 || to < 0 || to >= ws.length) return;
        const node = ws[from];
        node.parentNode?.insertBefore(node, e.key === "ArrowUp" ? ws[to] : ws[to].nextSibling);
        post({ ns: BB_NS, t: "reorder", ids: orderIds(), moved: selectedId });
        node.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
        scheduleRefresh();
      } else if ((e.key === "Delete" || e.key === "Backspace") && m?.deletable) {
        e.preventDefault();
        post({ ns: BB_NS, t: "action", id: selectedId, action: "delete" });
      }
    };

    const onSubmit = (e: Event) => {
      // no lead/newsletter submissions from inside the canvas — ever
      e.preventDefault();
      e.stopPropagation();
    };

    const onError = (e: ErrorEvent) => {
      if (errorsSent >= 3) return;
      errorsSent += 1;
      post({ ns: BB_NS, t: "error", message: String(e.message ?? "canvas error").slice(0, 500) });
    };

    /* --------------------------------------------------- shell messages */
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== parent) return;
      const msg = parseShellMsg(e.data);
      if (!msg) return;
      switch (msg.t) {
        case "init":
        case "meta":
          metas.clear();
          for (const m of msg.metas) metas.set(m.id, m);
          revealAll();
          scheduleRefresh();
          break;
        case "order": {
          const byId = new Map(wrappers().map((w) => [w.getAttribute("data-bb-id")!, w]));
          const parentNode = wrappers()[0]?.parentNode;
          if (!parentNode) break;
          let anchor: ChildNode | null = wrappers()[0];
          for (const id of msg.ids) {
            const node = byId.get(id);
            if (!node) continue;
            parentNode.insertBefore(node, anchor);
            anchor = node.nextSibling;
          }
          scheduleRefresh();
          break;
        }
        case "hidden": {
          const w = wrapperOf(msg.id);
          if (w) {
            w.style.display = msg.hidden ? "none" : "";
            if (msg.hidden) w.setAttribute("data-bb-hidden", "1");
            else w.removeAttribute("data-bb-hidden");
          }
          scheduleRefresh();
          break;
        }
        case "replace": {
          const w = wrapperOf(msg.id);
          if (w) {
            w.innerHTML = msg.html;
            revealAll();
          }
          scheduleRefresh();
          break;
        }
        case "insert": {
          const div = document.createElement("div");
          div.setAttribute("data-bb-id", msg.meta.id);
          div.innerHTML = msg.html;
          const ws = wrappers();
          const parentNode = ws[0]?.parentNode;
          if (!parentNode) break;
          const ref = msg.index >= ws.length ? ws[ws.length - 1]?.nextSibling ?? null : ws[msg.index];
          parentNode.insertBefore(div, ref);
          metas.set(msg.meta.id, msg.meta);
          setSelected(msg.meta.id);
          div.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
          break;
        }
        case "remove": {
          wrapperOf(msg.id)?.remove();
          metas.delete(msg.id);
          if (selectedId === msg.id) setSelected(null);
          if (hoverId === msg.id) hoverId = null;
          scheduleRefresh();
          break;
        }
        case "select":
          setSelected(msg.id);
          break;
        case "scrollTo":
          wrapperOf(msg.id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
          break;
        case "field": {
          const w = wrapperOf(msg.id);
          const el = w?.querySelector<HTMLElement>(`[data-bb-field="${CSS.escape(msg.field)}"]`);
          if (el && !el.hasAttribute("data-bb-rich")) el.textContent = msg.value;
          break;
        }
        case "regionHtml": {
          const el = document.querySelector<HTMLElement>(`[data-bb-region="${CSS.escape(msg.region)}"]`);
          if (el) {
            if (el.classList.contains("ed-rich")) el.innerHTML = msg.html;
            else el.outerHTML = msg.html;
          }
          break;
        }
        case "overlays":
          overlaysOn = msg.on;
          if (!msg.on) {
            hoverId = null;
            toolbar.style.display = "none";
            insLine.style.display = "none";
          }
          scheduleRefresh();
          break;
      }
    };

    /** scroll-reveal states have no place on an editing surface — every
        section is visible in the canvas immediately */
    const revealAll = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        el.classList.remove("reveal-hidden");
        el.classList.add("reveal-in");
      });
    };

    window.addEventListener("message", onMessage);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDblClick, true);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("error", onError);
    window.addEventListener("scroll", scheduleRefresh, { passive: true });
    window.addEventListener("resize", scheduleRefresh);

    revealAll();
    post({ ns: BB_NS, t: "ready", ids: orderIds() });

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDblClick, true);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("scroll", scheduleRefresh);
      window.removeEventListener("resize", scheduleRefresh);
      root.remove();
      style.remove();
    };
  }, []);

  return null;
}
