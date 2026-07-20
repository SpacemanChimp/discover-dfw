import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/db/admin";
import { sendEmail } from "@/lib/email/resend";
import { LETTER_FROM, letterUnsubscribeUrl } from "@/lib/email/letter";
import { buildLetterIssueEmail, UNSUB_PLACEHOLDER, type IssueSections, type IssueStats } from "@/lib/email/letter-issue";
import { generateIssueStats, getPreviousSentIssue, lintIssue } from "@/lib/content/letter-issues";
import { findPage } from "@/lib/content/community-content-drafts";
import {
  isLetterDoc,
  sanitizeLetterDoc,
  lintLetterDoc,
  renderLetterEmail,
  defaultLetterDoc,
  letterDocFromLegacy,
  type LetterDoc,
} from "@/lib/email/letter-blocks";
import type { SupabaseClient } from "@supabase/supabase-js";

/* The Letter — issue actions (TL-2). Admin-only (ADMIN_EMAILS gate before
   anything is read; 404 to everyone else). NO AUTO-SEND EXISTS: nothing
   schedules these actions, and 'send' additionally requires the typed
   phrase SEND <issue-date> in the request body from a live admin session.

   Send discipline:
   - single-flight lock via content_job_runs ('letter_send')
   - audience recomputed AT SEND TIME as status='subscribed' only
   - one letter_sends row per (issue, subscriber), UNIQUE — inserted
     BEFORE the Resend call, so a re-run can only reach subscribers with
     no row (or retry rows stuck 'failed'/'sending'); double-delivery is
     structurally impossible
   - every recipient gets their OWN unsubscribe token substituted into
     the body and the List-Unsubscribe / one-click headers
   'test-send' renders the same issue with a TEST banner and delivers
   ONLY to the signed-in admin's own address — never to subscribers. */

export const runtime = "nodejs";
export const maxDuration = 300;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}
const missing = (msg: string) => /relation .* does not exist|schema cache/i.test(msg);

function nextSunday(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const add = day === 0 ? 0 : 7 - day;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

type Body = {
  action?: string;
  issueId?: string;
  issueDate?: string;
  subject?: string;
  /** legacy flat sections OR the block document — both accepted */
  sections?: IssueSections | LetterDoc | unknown;
  confirm?: string;
  versionNo?: number;
};

/** shape-dispatched render: block documents get the block renderer (with
    a plain-text alternative); legacy flat issues keep the ORIGINAL
    renderer byte-for-byte (sent history renders exactly as it sent) */
function renderIssue(issue: { issue_date: string; subject: string | null; sections_json: unknown; stats_json: IssueStats | null }, isTest: boolean): { subject: string; html: string; text?: string } {
  const subject = issue.subject ?? `The Letter — ${issue.issue_date}`;
  if (isLetterDoc(issue.sections_json)) {
    return renderLetterEmail({ issueDate: issue.issue_date, subject, doc: issue.sections_json, stats: issue.stats_json, isTest });
  }
  return buildLetterIssueEmail({ issueDate: issue.issue_date, subject, sections: issue.sections_json as IssueSections, stats: issue.stats_json as IssueStats, isTest });
}

/** shape-dispatched lint: the READY/SEND gate for both formats */
function lintAny(subject: string | null, sections: unknown): { errors: string[]; warnings: string[] } {
  if (isLetterDoc(sections)) return lintLetterDoc(subject, sections, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
  const l = lintIssue(subject, sections as IssueSections);
  return { errors: l.errors ?? [], warnings: l.warnings ?? [] };
}

const LETTER_ROUTE = (issueId: string) => `__letter/${issueId}`;

/** Version snapshot into the EXISTING audited editor store (0018 rails:
    optimistic concurrency, append-only history, verification events).
    Failure is reported, never fatal — the canonical issue row already
    saved. */
async function snapshotVersion(db: SupabaseClient, issueId: string, doc: LetterDoc, subject: string | null, docText: string, adminEmail: string): Promise<{ versionNo: number | null; error: string | null }> {
  try {
    const route = LETTER_ROUTE(issueId);
    const { data: d } = await db.from("editor_documents").select("draft_version_id, published_version_id").eq("route", route).eq("region_key", "__blocks").maybeSingle();
    let base = 0;
    const ptr = d?.draft_version_id ?? d?.published_version_id;
    if (ptr) {
      const { data: v } = await db.from("editor_versions").select("version_no").eq("id", ptr).single();
      base = v?.version_no ?? 0;
    }
    const { data, error } = await db.rpc("editor_save_draft", {
      p_route: route,
      p_region_key: "__blocks",
      p_content_type: "layout",
      p_content_json: doc,
      p_content_text: docText.slice(0, 4000),
      p_seo_title: (subject ?? "").slice(0, 200) || null,
      p_seo_description: null,
      p_base_version: base,
      p_admin_email: adminEmail,
    });
    if (error) return { versionNo: null, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { versionNo: (row as { version_no?: number } | null)?.version_no ?? null, error: null };
  } catch (e) {
    return { versionNo: null, error: e instanceof Error ? e.message : "snapshot failed" };
  }
}

export async function POST(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ ok: false }, { status: 404 }); // don't advertise the surface
  const db = getSupabaseAdmin();
  if (!db) return bad("Not configured", 503);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Expected JSON body");
  }

  /* ---- generate: create/refresh a draft issue's stats ---- */
  if (body.action === "generate") {
    const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(body.issueDate ?? "") ? body.issueDate! : nextSunday();
    const prev = await getPreviousSentIssue(issueDate);
    const stats = await generateIssueStats(prev?.stats ?? null);
    if ("error" in stats) return bad(missing(stats.error) ? "has migration 0015 been applied?" : stats.error, 503);

    const { data: existing, error: exErr } = await db
      .from("letter_issues")
      .select("id, status, sections_json, subject")
      .eq("issue_date", issueDate)
      .maybeSingle();
    if (exErr) return bad(missing(exErr.message) ? "letter_issues missing — has migration 0015 been applied?" : exErr.message, 503);
    if (existing && (existing.status === "sent" || existing.status === "canceled"))
      return bad(`Issue ${issueDate} is ${existing.status} — pick another date`, 409);

    if (existing) {
      const { error } = await db.from("letter_issues").update({ stats_json: stats, status: "draft" }).eq("id", existing.id);
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ok: true, issueId: existing.id, issueDate, stats, regenerated: true });
    }
    const { data: created, error } = await db
      .from("letter_issues")
      .insert({
        issue_date: issueDate,
        subject: null,
        sections_json: defaultLetterDoc(),
        stats_json: stats,
        status: "draft",
        created_by: adminUser.email,
      })
      .select("id")
      .single();
    if (error) return bad(missing(error.message) ? "letter_issues missing — has migration 0015 been applied?" : error.message, 503);
    return NextResponse.json({ ok: true, issueId: created.id, issueDate, stats, regenerated: false });
  }

  /* ---- everything else needs an existing issue ---- */
  const issueId = String(body.issueId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(issueId)) return bad("Missing issueId");
  const { data: issue, error: getErr } = await db.from("letter_issues").select("*").eq("id", issueId).single();
  if (getErr || !issue) return bad("Issue not found", 404);

  if (body.action === "save") {
    if (issue.status !== "draft" && issue.status !== "ready") return bad(`Issue is ${issue.status}`, 409);
    const subject = body.subject !== undefined ? String(body.subject).slice(0, 120) : issue.subject;

    /* block document (the visual editor): server-side sanitation is the
       contract — the stored JSON is the sanitizer's output */
    if (isLetterDoc(body.sections)) {
      const s = sanitizeLetterDoc(body.sections, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
      if (!s.ok || !s.doc) return NextResponse.json({ ok: false, errors: s.errors }, { status: 422 });
      // resolve + freeze every community-spotlight page name server-side
      for (const b of s.doc.blocks) {
        if (b.type === "community-spotlight") {
          const page = findPage(b.citySlug, b.hoodSlug);
          if (!page) return bad(`community-spotlight ${b.citySlug}/${b.hoodSlug} is not an existing page`, 409);
          b.name = page.hood.name;
        }
      }
      const lint = lintLetterDoc(subject, s.doc, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
      const { error } = await db
        .from("letter_issues")
        .update({ subject, sections_json: s.doc, status: "draft" }) // edits drop readiness
        .eq("id", issueId);
      if (error) return bad(error.message, 500);
      const snap = await snapshotVersion(db, issueId, s.doc, subject, s.text, adminUser.email);
      return NextResponse.json({ ok: true, lint, versionNo: snap.versionNo, versionError: snap.error });
    }

    /* legacy flat shape — unchanged behavior */
    const sections = (body.sections as IssueSections | undefined) ?? issue.sections_json;
    if (sections?.communityOfWeek) {
      const page = findPage(sections.communityOfWeek.citySlug, sections.communityOfWeek.hoodSlug);
      if (!page) return bad("communityOfWeek is not an existing page", 409);
      sections.communityOfWeek.name = page.hood.name;
      sections.communityOfWeek.blurb = String(sections.communityOfWeek.blurb ?? "").slice(0, 400);
    }
    const lint = lintIssue(subject, sections);
    const { error } = await db
      .from("letter_issues")
      .update({ subject, sections_json: sections, status: "draft" }) // edits drop readiness
      .eq("id", issueId);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, lint });
  }

  /* ---- convert: one-way upgrade of a DRAFT/READY legacy issue to blocks
     (sent/canceled issues keep their shape forever) ---- */
  if (body.action === "convert") {
    if (issue.status !== "draft" && issue.status !== "ready") return bad(`Issue is ${issue.status} — sent history keeps its original format`, 409);
    if (isLetterDoc(issue.sections_json)) return NextResponse.json({ ok: true, doc: issue.sections_json, already: true });
    const doc = letterDocFromLegacy(issue.sections_json as IssueSections);
    const s = sanitizeLetterDoc(doc, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
    if (!s.ok || !s.doc) return NextResponse.json({ ok: false, errors: s.errors }, { status: 422 });
    const { error } = await db.from("letter_issues").update({ sections_json: s.doc, status: "draft" }).eq("id", issueId);
    if (error) return bad(error.message, 500);
    const snap = await snapshotVersion(db, issueId, s.doc, issue.subject, s.text, adminUser.email);
    return NextResponse.json({ ok: true, doc: s.doc, versionNo: snap.versionNo });
  }

  /* ---- preview: rendered html + plain text for the editor canvas ---- */
  if (body.action === "preview") {
    if (!issue.sections_json) return bad("Write the issue first", 422);
    const r = renderIssue(issue, true);
    // preview carries a dead unsubscribe target — no token is minted
    return NextResponse.json({
      ok: true,
      subject: r.subject,
      html: r.html.split(UNSUB_PLACEHOLDER).join("#unsubscribe-preview"),
      text: (r.text ?? "").split(UNSUB_PLACEHOLDER).join("(per-recipient unsubscribe link)"),
    });
  }

  /* ---- versions: the issue's audited edit history ---- */
  if (body.action === "versions") {
    const { data: docRow } = await db
      .from("editor_documents")
      .select("id")
      .eq("route", LETTER_ROUTE(issueId))
      .eq("region_key", "__blocks")
      .maybeSingle();
    if (!docRow) return NextResponse.json({ ok: true, versions: [] });
    const { data: versions, error } = await db
      .from("editor_versions")
      .select("version_no, status, seo_title, created_by, created_at")
      .eq("document_id", docRow.id)
      .order("version_no", { ascending: false })
      .limit(50);
    if (error) return bad(error.message, 500);
    return NextResponse.json({
      ok: true,
      versions: (versions ?? []).map((v) => ({ versionNo: v.version_no, status: v.status, subject: v.seo_title, admin: v.created_by, at: v.created_at })),
    });
  }

  /* ---- restore: an old version becomes a NEW draft version — send
     history and sent issues are never rewritten ---- */
  if (body.action === "restore") {
    if (issue.status !== "draft" && issue.status !== "ready") return bad(`Issue is ${issue.status} — sent history is immutable`, 409);
    const versionNo = Number(body.versionNo);
    if (!Number.isInteger(versionNo) || versionNo < 1) return bad("Missing versionNo");
    const { data: docRow } = await db
      .from("editor_documents")
      .select("id")
      .eq("route", LETTER_ROUTE(issueId))
      .eq("region_key", "__blocks")
      .maybeSingle();
    if (!docRow) return bad("No version history for this issue", 404);
    const { data: v, error: vErr } = await db
      .from("editor_versions")
      .select("content_json, seo_title")
      .eq("document_id", docRow.id)
      .eq("version_no", versionNo)
      .single();
    if (vErr || !v) return bad(`Version ${versionNo} not found`, 404);
    const s = sanitizeLetterDoc(v.content_json, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
    if (!s.ok || !s.doc) return NextResponse.json({ ok: false, errors: s.errors }, { status: 422 });
    const subject = (v.seo_title as string | null) ?? issue.subject;
    const { error } = await db.from("letter_issues").update({ subject, sections_json: s.doc, status: "draft" }).eq("id", issueId);
    if (error) return bad(error.message, 500);
    const snap = await snapshotVersion(db, issueId, s.doc, subject, s.text, adminUser.email);
    return NextResponse.json({ ok: true, restoredFrom: versionNo, newVersionNo: snap.versionNo, subject });
  }

  if (body.action === "ready") {
    if (issue.status !== "draft" && issue.status !== "ready") return bad(`Issue is ${issue.status}`, 409);
    const lint = lintAny(issue.subject, issue.sections_json);
    if (lint.errors.length) return NextResponse.json({ ok: false, error: `lint blocks readiness: ${lint.errors.length} error(s)`, lint }, { status: 422 });
    if (!issue.stats_json) return bad("Generate the week's numbers first", 422);
    const { error } = await db.from("letter_issues").update({ status: "ready" }).eq("id", issueId);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true, lint });
  }

  if (body.action === "cancel") {
    if (issue.status === "sent") return bad("Sent issues are history — they can't be canceled", 409);
    const { error } = await db.from("letter_issues").update({ status: "canceled" }).eq("id", issueId);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true });
  }

  /* ---- test-send: the admin's own inbox ONLY ---- */
  if (body.action === "test-send") {
    if (!issue.stats_json || !issue.sections_json) return bad("Generate + write the issue first", 422);
    const { subject, html, text } = renderIssue(issue, true);
    // test copies carry a dead unsubscribe target on purpose — the admin
    // is not unsubscribing themselves from a test
    const sent = await sendEmail({
      to: adminUser.email,
      subject: `[TEST] ${subject}`,
      html: html.split(UNSUB_PLACEHOLDER).join(`mailto:${adminUser.email}?subject=test-copy`),
      text: text ? text.split(UNSUB_PLACEHOLDER).join(`mailto:${adminUser.email}`) : undefined,
      from: LETTER_FROM,
    });
    if (!sent.ok) return bad(`test send failed: ${sent.error}`, 502);
    return NextResponse.json({ ok: true, to: adminUser.email, dryRun: sent.dryRun ?? false });
  }

  /* ---- send: the real thing — typed confirmation required ---- */
  if (body.action === "send") {
    if (issue.status !== "ready") return bad(`Issue is ${issue.status} — only 'ready' issues send`, 409);
    const expected = `SEND ${issue.issue_date}`;
    if (body.confirm !== expected) return bad(`Type the confirmation phrase exactly: ${expected}`, 428);
    const lint = lintAny(issue.subject, issue.sections_json);
    if (lint.errors.length) return bad("lint no longer passes — re-edit the issue", 422);

    // single-flight lock (the CI pattern): one letter send at a time, ever
    const { data: run, error: lockErr } = await db
      .from("content_job_runs")
      .insert({ job_name: "letter_send", dry_run: false })
      .select("id")
      .single();
    if (lockErr)
      return bad(
        lockErr.code === "23505"
          ? "another letter send is in flight (or a crashed run holds the lock) — release it before retrying"
          : lockErr.message,
        409
      );

    let sentN = 0, failedN = 0, skippedN = 0;
    try {
      // audience recomputed NOW: confirmed subscribers only
      const { data: audience, error: audErr } = await db
        .from("letter_subscribers")
        .select("id, email")
        .eq("status", "subscribed");
      if (audErr) throw new Error(audErr.message);

      const rendered = renderIssue(issue, false);

      for (const sub of audience ?? []) {
        // claim the (issue, subscriber) slot BEFORE any send
        const { data: claim, error: claimErr } = await db
          .from("letter_sends")
          .insert({ issue_id: issueId, subscriber_id: sub.id, status: "sending" })
          .select("id")
          .single();
        let sendRowId = claim?.id as string | undefined;
        if (claimErr) {
          if (claimErr.code === "23505") {
            // already attempted: retry ONLY failed/stuck rows, never 'sent'
            const { data: prior } = await db
              .from("letter_sends")
              .select("id, status")
              .eq("issue_id", issueId)
              .eq("subscriber_id", sub.id)
              .single();
            if (!prior || prior.status === "sent") {
              skippedN++;
              continue;
            }
            sendRowId = prior.id;
            await db.from("letter_sends").update({ status: "sending", error: null }).eq("id", prior.id);
          } else {
            failedN++;
            continue;
          }
        }

        const unsubUrl = letterUnsubscribeUrl(sub.id);
        const personal = rendered.html.split(UNSUB_PLACEHOLDER).join(unsubUrl ?? "#");
        const sent = await sendEmail({
          to: sub.email,
          subject: rendered.subject,
          html: personal,
          text: rendered.text ? rendered.text.split(UNSUB_PLACEHOLDER).join(unsubUrl ?? "#") : undefined,
          from: LETTER_FROM,
          headers: unsubUrl
            ? { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
            : undefined,
        });
        if (sent.ok) {
          sentN++;
          await db.from("letter_sends").update({ status: "sent" }).eq("id", sendRowId!);
        } else {
          failedN++;
          await db.from("letter_sends").update({ status: "failed", error: sent.error ?? "send failed" }).eq("id", sendRowId!);
        }
      }

      await db
        .from("letter_issues")
        .update({ status: "sent", sent_at: new Date().toISOString(), sent_count: sentN, failed_count: failedN })
        .eq("id", issueId);
      return NextResponse.json({ ok: true, sent: sentN, failed: failedN, skippedAlreadySent: skippedN });
    } catch (e) {
      return bad(e instanceof Error ? e.message : "send crashed", 500);
    } finally {
      await db
        .from("content_job_runs")
        .update({ finished_at: new Date().toISOString(), status: failedN ? "partial" : "success", items_seen: sentN + failedN + skippedN, items_written: sentN })
        .eq("id", run.id);
    }
  }

  return bad(`Unknown action "${body.action}"`);
}
