"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { PageDocumentEditor } from "@/components/PageDocumentEditor";
import { markMissingAltImages } from "@/lib/page-editor-format";
import { DEFAULT_THEME, themeToEditorPalette } from "@/lib/kb-theme";
import type { ContentBlock, KbPage, KnowledgeBase, PageStatus, PageVisibility } from "@/lib/types";

interface ParentOption {
  path: string;
  title: string;
  depth: number;
  status: PageStatus;
}

type EditableStatus = "draft" | "published";

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
  const [busy, setBusy] = useState<EditableStatus | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<PageStatus>(page.status);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);
  
  const [lockError, setLockError] = useState<string | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    async function heartbeatLock() {
      try {
        const res = await fetch(`/api/admin/pages/${page.id}/lock`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setLockError(data.message || "Page is locked by another user.");
          clearInterval(interval);
        } else {
          setLockError(null);
        }
      } catch (err) {
        // Ignore network errors, try again next tick
      }
    }

    heartbeatLock();
    interval = setInterval(heartbeatLock, 60000); // Heartbeat every 60s

    return () => {
      clearInterval(interval);
      fetch(`/api/admin/pages/${page.id}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [page.id]);

  const previewUrl = useMemo(() => savedUrl ?? `/kb/${kb.slug}/${page.path.join("/")}`, [kb.slug, page.path, savedUrl]);

  // Map blocking publish issues onto the specific fields they reference so the
  // editor can highlight what needs fixing.
  const summaryError = issues.some((issue) => issue.toLowerCase().includes("summary"));
  const contactError = issues.some((issue) => issue.toLowerCase().includes("contact email"));
  const altError = issues.some((issue) => issue.toLowerCase().includes("alt text"));

  useEffect(() => {
    if (altError) {
      markMissingAltImages();
    }
  }, [altError, issues]);

  // Track unsaved changes so Publish can save first and the UI can warn before
  // status actions that ignore the in-progress form.
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
            Required before publishing. Owner and contact are kept in admin metadata; the public page shows
            only the &ldquo;Updated on&rdquo; date.
          </p>
          <label>
            <span className="meta">Owner or office</span>
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
        </fieldset>

        <fieldset className="fieldset editor-content" disabled={isLocked}>
          <legend>Content</legend>
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
