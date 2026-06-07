"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageDocumentEditor } from "@/components/PageDocumentEditor";
import { markMissingAltImages, markProblemLinks } from "@/lib/page-editor-format";
import { DEFAULT_THEME, themeToEditorPalette } from "@/lib/kb-theme";
import type { ContentBlock, KbPage, KnowledgeBase, PageStatus, PageVisibility } from "@/lib/types";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const VAGUE_LINK_TEXT = new Set(["click here", "here", "more", "read more", "link", "this"]);

interface ParentOption {
  path: string;
  title: string;
  depth: number;
  status: PageStatus;
}

type EditableStatus = "draft" | "published";

function collectInlineHtml(blocks: ContentBlock[]): string[] {
  const html: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "heading" || block.type === "alert") {
      if (block.html) html.push(block.html);
    } else if (block.type === "list") {
      html.push(...(block.itemHtml ?? []));
    } else if (block.type === "table") {
      html.push(...(block.rowsHtml ?? []).flat());
    } else if (block.type === "card") {
      html.push(...collectInlineHtml(block.blocks));
    } else if (block.type === "procedure_section") {
      html.push(...collectInlineHtml(block.blocks));
    }
  }
  return html;
}

function textFromHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function hasBadLinks(blocks: ContentBlock[]) {
  let vague = false;
  let empty = false;
  for (const html of collectInlineHtml(blocks)) {
    const links = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi);
    for (const link of links) {
      const attrs = link[1] ?? "";
      const href = attrs.match(/\bhref=["']([^"']*)["']/i)?.[1]?.trim() ?? "";
      const label = textFromHtml(link[2] ?? "").toLowerCase();
      if (!href || href === "#") empty = true;
      if (!label || VAGUE_LINK_TEXT.has(label)) vague = true;
    }
  }
  return { vague, empty };
}

interface BlockIssueCounts {
  imagesMissingAlt: number;
  tablesMissingHeaders: number;
  h3BeforeH2: boolean;
  hasH2: boolean;
}

function countBlockIssues(blocks: ContentBlock[]): BlockIssueCounts {
  let imagesMissingAlt = 0;
  let tablesMissingHeaders = 0;
  let h3BeforeH2 = false;
  let seenH2 = false;

  for (const block of blocks) {
    if (block.type === "heading") {
      if (block.level === 2) seenH2 = true;
      if (block.level === 3 && !seenH2) h3BeforeH2 = true;
    } else if (block.type === "procedure_section") {
      if (block.level === 2) seenH2 = true;
      if (block.level === 3 && !seenH2) h3BeforeH2 = true;
      const nested = countBlockIssues(block.blocks);
      imagesMissingAlt += nested.imagesMissingAlt;
      tablesMissingHeaders += nested.tablesMissingHeaders;
      h3BeforeH2 ||= nested.h3BeforeH2 && !seenH2;
      seenH2 ||= nested.hasH2;
    } else if (block.type === "image") {
      if ((block.assetId || block.url) && !block.decorative && !(block.alt ?? "").trim()) {
        imagesMissingAlt += 1;
      }
    } else if (block.type === "table") {
      if (!block.hasHeaderRow && !block.hasHeaderColumn) {
        tablesMissingHeaders += 1;
      }
    } else if (block.type === "card") {
      const nested = countBlockIssues(block.blocks);
      imagesMissingAlt += nested.imagesMissingAlt;
      tablesMissingHeaders += nested.tablesMissingHeaders;
      h3BeforeH2 ||= nested.h3BeforeH2 && !seenH2;
      seenH2 ||= nested.hasH2;
    }
  }

  return { imagesMissingAlt, tablesMissingHeaders, h3BeforeH2, hasH2: seenH2 };
}

export function AdminPageEditorForm({
  kb,
  page,
  parentOptions,
}: {
  kb: KnowledgeBase;
  page: KbPage;
  parentOptions: ParentOption[];
}) {
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [summary, setSummary] = useState(page.summary);
  const [visibility, setVisibility] = useState<PageVisibility>(page.visibility);
  const [parentPath, setParentPath] = useState(page.path.slice(0, -1).join("/"));
  const [ownerLabel, setOwnerLabel] = useState(page.ownerLabel);
  const [contactEmail, setContactEmail] = useState(page.contactEmail);
  const [lastReviewedDate, setLastReviewedDate] = useState(page.lastReviewedDate);
  const [showToc, setShowToc] = useState(page.showToc);
  const [tocDepth, setTocDepth] = useState(page.tocDepth);
  const [showSummary, setShowSummary] = useState(page.showSummary !== false);
  const [blocks, setBlocks] = useState<ContentBlock[]>(page.blocks);
  const [nextReviewDate, setNextReviewDate] = useState(page.nextReviewDate);
  const [verifiedAt, setVerifiedAt] = useState(page.verifiedAt);
  const [verifiedBy, setVerifiedBy] = useState(page.verifiedBy);
  const [busy, setBusy] = useState<EditableStatus | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<PageStatus>(page.status);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);

  const [lockError, setLockError] = useState<string | null>(null);
  const missedHeartbeats = useRef(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function heartbeatLock() {
      try {
        const res = await fetch(`/api/admin/pages/${page.id}/lock`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          missedHeartbeats.current += 1;
          if (missedHeartbeats.current >= 3) {
            setLockError(data.message || "Page is locked by another user.");
            clearInterval(interval);
          }
        } else {
          missedHeartbeats.current = 0;
          setLockError(null);
        }
      } catch (err) {
        missedHeartbeats.current += 1;
        if (missedHeartbeats.current >= 3) {
          setLockError("Page lock could not be renewed. Check your connection before continuing.");
          clearInterval(interval);
        }
      }
    }

    heartbeatLock();
    interval = setInterval(heartbeatLock, 60000); 

    return () => {
      clearInterval(interval);
      fetch(`/api/admin/pages/${page.id}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [page.id]);

  const previewUrl = useMemo(() => savedUrl ?? `/kb/${kb.slug}/${page.path.join("/")}`, [kb.slug, page.path, savedUrl]);

  const summaryError = issues.some((issue) => issue.toLowerCase().includes("summary"));
  const contactError = issues.some((issue) => issue.toLowerCase().includes("contact email"));
  const altError = issues.some((issue) => issue.toLowerCase().includes("alt text"));

  useEffect(() => {
    if (altError) {
      markMissingAltImages();
    }
  }, [altError, issues]);

  const currentSnapshot = JSON.stringify({
    title,
    slug,
    summary,
    visibility,
    parentPath,
    ownerLabel,
    contactEmail,
    lastReviewedDate,
    showToc,
    tocDepth,
    showSummary,
    blocks,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(currentSnapshot);
  const dirty = currentSnapshot !== savedSnapshot;
  const readinessIssues = useMemo(() => {
    const next: string[] = [];
    if (!title.trim()) next.push("Add a page title.");
    if (!summary.trim()) next.push("Add a summary.");
    if (!ownerLabel.trim()) next.push("Add a responsible office.");
    if (!contactEmail.trim() || !EMAIL_PATTERN.test(contactEmail.trim())) {
      next.push("Add a valid contact email.");
    }
    if (!lastReviewedDate.trim()) next.push("Add a last reviewed date.");

    const blockIssues = countBlockIssues(blocks);
    if (blockIssues.h3BeforeH2) {
      next.push("Fix heading order: use an H2 before any H3.");
    }
    if (blockIssues.imagesMissingAlt > 0) {
      next.push(
        `${blockIssues.imagesMissingAlt} image${blockIssues.imagesMissingAlt === 1 ? " needs" : "s need"} alt text or decorative status.`,
      );
    }
    if (blockIssues.tablesMissingHeaders > 0) {
      next.push(
        `${blockIssues.tablesMissingHeaders} table${blockIssues.tablesMissingHeaders === 1 ? " needs" : "s need"} a header row or header column.`,
      );
    }

    const linkIssues = hasBadLinks(blocks);
    if (linkIssues.vague) next.push("Replace vague link text such as \"click here\".");
    if (linkIssues.empty) next.push("Add destinations for empty links.");
    return next;
  }, [blocks, contactEmail, lastReviewedDate, ownerLabel, summary, title]);
  useEffect(() => {
    markProblemLinks();
  }, [readinessIssues]);

  async function setLifecycleStatus(status: PageStatus) {
    if (lockError) return;
    if (dirty && !window.confirm("You have unsaved changes that won't be included in this action. Continue anyway?")) {
      return;
    }
    setLifecycleBusy(true);
    setError(null);
    setIssues([]);
    setLifecycleMessage(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data.issues) && data.issues.length > 0) {
          setIssues(data.issues as string[]);
        }
        throw new Error(data.message ?? "Could not update page status.");
      }
      setSavedStatus(status);
      setSavedUrl(data.url ?? null);
      setLifecycleMessage(
        status === "published"
          ? "Page published."
          : status === "archived"
            ? "Page archived. It is hidden from the public site."
            : "Page is now a draft.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update page status.");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function verifyPage() {
    if (lockError) return;
    setLifecycleBusy(true);
    setError(null);
    setLifecycleMessage(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}/verify`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not verify page.");
      }
      setVerifiedAt(data.verifiedAt);
      setVerifiedBy(data.verifiedBy);
      setNextReviewDate(data.nextReviewDate);
      setLifecycleMessage("Page verified and review clock reset (6 months).");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify page.");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function submit(status: EditableStatus) {
    if (lockError) return;
    setBusy(status);
    setError(null);
    setIssues([]);
    setSavedUrl(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          summary,
          visibility,
          status,
          parentPath: parentPath ? parentPath.split("/") : [],
          sortOrder: page.sortOrder,
          ownerLabel,
          contactEmail,
          lastReviewedDate,
          blocks,
          showToc,
          tocDepth,
          showSummary,
          nextReviewDate,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data.issues) && data.issues.length > 0) {
          setIssues(data.issues as string[]);
        }
        throw new Error(data.message ?? "Could not save the page.");
      }
      setSavedStatus(status);
      setSavedUrl(data.url ?? null);
      setSavedSnapshot(currentSnapshot);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the page.");
    } finally {
      setBusy(null);
    }
  }

  const isLocked = lockError !== null;

  const actionButtons = (
    <div className="import-actions">
      {dirty && (
        <span className="unsaved-pill" role="status">
          ● Unsaved changes
        </span>
      )}
      {savedStatus === "archived" ? (
        <button
          className="button"
          disabled={lifecycleBusy || isLocked}
          onClick={() => setLifecycleStatus("draft")}
          type="button"
        >
          {lifecycleBusy ? "Restoring..." : "Restore to draft"}
        </button>
      ) : (
        <>
          <button
            className="button button--ghost"
            disabled={busy !== null || lifecycleBusy || isLocked || !title || blocks.length === 0}
            onClick={() => submit("draft")}
            type="button"
          >
            {busy === "draft" ? "Saving..." : "Save draft"}
          </button>
          {savedStatus === "draft" ? (
            <button
              className="button"
              disabled={busy !== null || lifecycleBusy || isLocked || !title || blocks.length === 0}
              onClick={() => submit("published")}
              type="button"
            >
              {busy === "published" ? "Publishing..." : "Save & publish"}
            </button>
          ) : (
            <>
              <button
                className="button"
                disabled={busy !== null || lifecycleBusy || isLocked || !title || blocks.length === 0}
                onClick={() => submit("published")}
                type="button"
              >
                {busy === "published" ? "Saving..." : "Save changes"}
              </button>
              <button
                className="button button--ghost"
                disabled={lifecycleBusy || isLocked}
                onClick={() => setLifecycleStatus("draft")}
                type="button"
              >
                {lifecycleBusy ? "Unpublishing..." : "Unpublish"}
              </button>
            </>
          )}
          <button
            className="button button--ghost"
            disabled={lifecycleBusy || isLocked}
            onClick={() => setLifecycleStatus("archived")}
            type="button"
          >
            {lifecycleBusy ? "Archiving..." : "Archive"}
          </button>
        </>
      )}
      <Link className="button button--ghost" href={previewUrl}>
        View current page
      </Link>
    </div>
  );

  return (
    <div className="editor-layout">
      {lockError && (
        <div className="alert alert--error" style={{ marginBottom: "2rem" }}>
          <strong>Edit Lock Active:</strong> {lockError} <br />
          You cannot save changes to this page until the lock expires.
        </div>
      )}

      <form className="form card editor-form" onSubmit={(event) => event.preventDefault()}>
        {error && <p className="error">{error}</p>}
        {issues.length > 0 && (
          <div className="error" role="alert">
            <strong>Publishing is blocked until these are fixed:</strong>
            <ul className="issue-list">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            {altError && (
              <p className="meta">
                Images needing a description are outlined below — click the <strong>Alt</strong> button on each
                to add alt text or mark it decorative.
              </p>
            )}
          </div>
        )}
        {lifecycleMessage && <p className="alert alert--success">{lifecycleMessage}</p>}
        {savedUrl && (
          <p className="alert alert--success">
            Saved as <strong>{savedStatus}</strong>. <Link href={savedUrl}>View page</Link>
          </p>
        )}
        {actionButtons}

        <fieldset className="fieldset" disabled={isLocked}>
          <legend>Page Settings</legend>
          <label>
            <span className="meta">Title</span>
            <input className="input" onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label>
            <span className="meta">Slug</span>
            <input className="input" onChange={(event) => setSlug(event.target.value)} value={slug} />
          </label>
          <label>
            <span className="meta">Summary{summaryError && <span className="field-error-tag"> — required</span>}</span>
            <textarea
              aria-invalid={summaryError || undefined}
              className={`input${summaryError ? " input--error" : ""}`}
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              value={summary}
            />
          </label>
          <label className="checkbox-inline">
            <input checked={showSummary} onChange={(event) => setShowSummary(event.target.checked)} type="checkbox" />
            <span>Show the summary as a lead paragraph on the page</span>
          </label>
          <label>
            <span className="meta">Nest under</span>
            <select className="input" onChange={(event) => setParentPath(event.target.value)} value={parentPath}>
              <option value="">Top level</option>
              {parentOptions.map((option) => (
                <option key={option.path} value={option.path}>
                  {`${"  ".repeat(Math.max(0, option.depth - 1))}${option.title} (${option.status})`}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label>
              <span className="meta">Visibility</span>
              <select
                className="input"
                onChange={(event) => setVisibility(event.target.value === "staff" ? "staff" : "public")}
                value={visibility}
              >
                <option value="public">Public</option>
                <option value="staff">Staff only</option>
              </select>
            </label>
            <label>
              <span className="meta">Table of contents</span>
              <div className="toc-control">
                <label className="checkbox-inline">
                  <input
                    checked={showToc}
                    onChange={(event) => setShowToc(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Show on page</span>
                </label>
                <select
                  aria-label="Heading depth"
                  className="input toc-control__depth"
                  disabled={!showToc}
                  onChange={(event) => setTocDepth(Number(event.target.value))}
                  value={tocDepth}
                >
                  <option value={2}>H2 only</option>
                  <option value={3}>H2 + H3</option>
                </select>
              </div>
            </label>
          </div>
        </fieldset>

        <fieldset className="fieldset" disabled={isLocked}>
          <legend>Governance</legend>
          <p className="meta">
            Required before publishing. Responsible office and contact are kept in admin metadata; the public page shows
            only the &ldquo;Updated on&rdquo; date.
          </p>
          <label>
            <span className="meta">Responsible office</span>
            <input
              className="input"
              onChange={(event) => setOwnerLabel(event.target.value)}
              placeholder="e.g. Graduate School Outreach and Technology"
              value={ownerLabel}
            />
          </label>
          <label>
            <span className="meta">
              Contact email{contactError && <span className="field-error-tag"> — needs a valid address</span>}
            </span>
            <input
              aria-invalid={contactError || undefined}
              className={`input${contactError ? " input--error" : ""}`}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="name@wsu.edu"
              type="email"
              value={contactEmail}
            />
          </label>
          <label>
            <span className="meta">Last reviewed date</span>
            <input
              className="input"
              onChange={(event) => setLastReviewedDate(event.target.value)}
              type="date"
              value={lastReviewedDate}
            />
          </label>
          <label>
            <span className="meta">Next review date</span>
            <input
              className="input"
              onChange={(event) => setNextReviewDate(event.target.value)}
              type="date"
              value={nextReviewDate || ""}
            />
          </label>
          {verifiedAt && (
            <p className="meta" style={{ color: "var(--success)" }}>
              ✓ Verified on {new Date(verifiedAt).toLocaleDateString()} by {verifiedBy}
            </p>
          )}
          <div style={{ marginTop: "0.5rem" }}>
            <button
              className="button button--small button--ghost"
              disabled={lifecycleBusy || isLocked}
              onClick={verifyPage}
              type="button"
            >
              {lifecycleBusy ? "Verifying..." : "Verify now (resets 6-month clock)"}
            </button>
          </div>
        </fieldset>

        <fieldset className="fieldset editor-content" disabled={isLocked}>
          <legend>Content</legend>
          <div className={`editor-readiness ${readinessIssues.length === 0 ? "is-ready" : ""}`}>
            <strong>Publishing readiness</strong>
            {readinessIssues.length === 0 ? (
              <p className="meta">No accessibility or governance blockers detected in the current draft.</p>
            ) : (
              <ul className="issue-list">
                {readinessIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
          <PageDocumentEditor
            blocks={blocks}
            editorPalette={themeToEditorPalette(kb.theme ?? DEFAULT_THEME)}
            kbId={kb.id}
            kbSlug={kb.slug}
            key={page.id}
            onChange={setBlocks}
          />
        </fieldset>

        {actionButtons}
      </form>
    </div>
  );
}
