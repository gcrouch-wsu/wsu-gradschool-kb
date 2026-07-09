"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DraftPreviewModal } from "@/components/DraftPreviewModal";
import { formatTimestamp } from "@/lib/format";
import type { PageRevision, PageRevisionSummary } from "@/lib/types";

// Read-only revision history for a page. Lists saved revisions, lets an editor
// preview any one in public styling, and restore it — restore creates a new
// save/revision rather than rewriting history.
export function PageHistoryPanel({
  pageId,
  kbSlug,
  isLocked,
  reloadToken,
  onRestored,
}: {
  pageId: string;
  kbSlug: string;
  isLocked: boolean;
  reloadToken: number;
  onRestored: () => void;
}) {
  const [revisions, setRevisions] = useState<PageRevisionSummary[]>([]);
  // The reloadToken the current `revisions` were fetched for. Loading is derived
  // from this vs the incoming token, so a token bump (e.g. after a save) shows a
  // refreshing state without any setState during render or synchronously in the
  // load effect. Starts at a sentinel so the first load shows as loading.
  const [loadedToken, setLoadedToken] = useState(-1);
  const [refreshing, setRefreshing] = useState(false);
  // Errors carry the token they occurred under; a later token bump hides stale
  // view/restore errors automatically (see visibleError below).
  const [error, setError] = useState<{ token: number; text: string } | null>(null);
  const [preview, setPreview] = useState<PageRevision | null>(null);
  // View and restore have independent busy states so previewing a revision does
  // not make that row's restore button read "Working…" (or vice versa).
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const activeRef = useRef(true);

  const loading = refreshing || loadedToken !== reloadToken;
  const visibleError = error && error.token === reloadToken ? error.text : null;

  const fetchRevisions = useCallback(async (): Promise<PageRevisionSummary[]> => {
    const response = await fetch(`/api/admin/pages/${pageId}/revisions`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message ?? "Could not load revision history.");
    }
    return Array.isArray(data.revisions) ? data.revisions : [];
  }, [pageId]);

  // Refetch whenever the token changes (mount, or a save bumps reloadToken). All
  // setState calls happen after an await, so the effect never updates state
  // synchronously (keeps loading derived + lint clean).
  useEffect(() => {
    activeRef.current = true;
    const token = reloadToken;
    (async () => {
      try {
        const next = await fetchRevisions();
        if (!activeRef.current) return;
        setRevisions(next);
        setError((prev) => (prev && prev.token === token ? null : prev));
      } catch (caught) {
        if (!activeRef.current) return;
        setError({ token, text: caught instanceof Error ? caught.message : "Could not load revision history." });
      } finally {
        if (activeRef.current) setLoadedToken(token);
      }
    })();
    return () => {
      activeRef.current = false;
    };
  }, [fetchRevisions, reloadToken]);

  // Manual refresh of the current token's data (event handler — setState is fine).
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const token = reloadToken;
    try {
      const next = await fetchRevisions();
      if (activeRef.current) {
        setRevisions(next);
        setLoadedToken(token);
      }
    } catch (caught) {
      if (activeRef.current) {
        setError({ token, text: caught instanceof Error ? caught.message : "Could not load revision history." });
      }
    } finally {
      if (activeRef.current) setRefreshing(false);
    }
  }, [fetchRevisions, reloadToken]);

  async function viewRevision(revisionId: string) {
    setError(null);
    setViewingId(revisionId);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}/revisions/${revisionId}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.revision) {
        throw new Error(data.message ?? "Could not load this revision to preview.");
      }
      if (activeRef.current) setPreview(data.revision as PageRevision);
    } catch (caught) {
      if (activeRef.current) {
        setError({
          token: reloadToken,
          text: caught instanceof Error ? caught.message : "Could not load this revision to preview.",
        });
      }
    } finally {
      if (activeRef.current) setViewingId(null);
    }
  }

  async function restoreRevision(revision: PageRevisionSummary) {
    if (isLocked) return;
    if (
      !window.confirm(
        `Restore revision #${revision.revisionNumber}? This saves a new revision with that content; ` +
          "your current content stays in history and can be restored too.",
      )
    ) {
      return;
    }
    setError(null);
    setRestoringId(revision.id);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}/revisions/${revision.id}/restore`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message ?? "Could not restore this revision.");
      }
      // Leaves this view (full reload) on success, so keep the busy state set.
      onRestored();
    } catch (caught) {
      if (activeRef.current) {
        setError({
          token: reloadToken,
          text: caught instanceof Error ? caught.message : "Could not restore this revision.",
        });
        setRestoringId(null);
      }
    }
  }

  return (
    <div className="page-history">
      <div className="page-history__head">
        <strong>History</strong>
        <button
          aria-busy={loading}
          className="button button--small button--ghost"
          disabled={loading}
          onClick={refresh}
          type="button"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="meta">
        Every save records a revision. Restoring a revision saves it as a new version, so nothing is lost.
      </p>

      {/* Persistent live region so screen readers announce errors from refresh,
          view, and restore even when the message text changes in place. */}
      <div aria-live="assertive" role="alert" className="page-history__status">
        {visibleError && <p className="error">{visibleError}</p>}
      </div>

      {loading ? (
        <p className="meta">Loading revisions…</p>
      ) : revisions.length === 0 ? (
        <p className="meta">No revisions yet. The next save will create the first one.</p>
      ) : (
        <ul className="page-history__list">
          {revisions.map((revision) => (
            <li className="page-history__item" key={revision.id}>
              <div className="page-history__meta">
                <span className="page-history__number">#{revision.revisionNumber}</span>
                {revision.action === "restore" && <span className="badge badge--draft">restored</span>}
                <span className="badge">{revision.status}</span>
                <span className="meta">
                  {revision.authorEmail || "unknown"} · {formatTimestamp(revision.createdAt)}
                </span>
              </div>
              <div className="page-history__actions">
                <button
                  aria-busy={viewingId === revision.id}
                  className="button button--small button--ghost"
                  disabled={viewingId === revision.id}
                  onClick={() => viewRevision(revision.id)}
                  type="button"
                >
                  {viewingId === revision.id ? "Loading…" : "View"}
                </button>
                <button
                  aria-busy={restoringId === revision.id}
                  className="button button--small"
                  disabled={isLocked || restoringId === revision.id}
                  onClick={() => restoreRevision(revision)}
                  title={isLocked ? "This page is locked — you cannot restore right now." : undefined}
                  type="button"
                >
                  {restoringId === revision.id ? "Working…" : "Restore this version"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <DraftPreviewModal
          blocks={preview.blocks}
          kbSlug={kbSlug}
          onClose={() => setPreview(null)}
          showSummary={preview.showSummary !== false}
          summary={preview.summary}
          title={preview.title}
        />
      )}
    </div>
  );
}
