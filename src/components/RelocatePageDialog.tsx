"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DropdownSelect } from "@/components/DropdownSelect";
import { useModalA11y } from "@/lib/use-modal-a11y";
import type { KnowledgeBase } from "@/lib/types";

export type RelocateMode = "copy" | "move";

interface ParentOption {
  path: string;
  title: string;
  depth: number;
}

export function RelocatePageDialog({
  pageId,
  pageTitle,
  sourceKbId,
  destinationKbs,
  initialMode = "copy",
  onCancel,
  onComplete,
}: {
  pageId: string;
  pageTitle: string;
  sourceKbId: string;
  destinationKbs: Array<Pick<KnowledgeBase, "id" | "title" | "slug" | "visibility">>;
  initialMode?: RelocateMode;
  onCancel: () => void;
  onComplete: (result: { mode: RelocateMode; pageId: string; editHref: string }) => void;
}) {
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel);
  const headingId = useId();
  const moveTargets = useMemo(
    () => destinationKbs.filter((kb) => kb.id !== sourceKbId),
    [destinationKbs, sourceKbId],
  );
  const [mode, setMode] = useState<RelocateMode>(
    initialMode === "move" && moveTargets.length === 0 ? "copy" : initialMode,
  );
  const availableKbs = mode === "move" ? moveTargets : destinationKbs;
  const [selectedKbId, setSelectedKbId] = useState(availableKbs[0]?.id ?? "");
  const targetKbId = availableKbs.some((kb) => kb.id === selectedKbId)
    ? selectedKbId
    : (availableKbs[0]?.id ?? "");
  const [parentPath, setParentPath] = useState("");
  const [includeChildren, setIncludeChildren] = useState(true);
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [parentsForKb, setParentsForKb] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingParents = Boolean(targetKbId) && parentsForKb !== targetKbId;
  const effectiveParentPath = parentsForKb === targetKbId ? parentPath : "";

  useEffect(() => {
    if (!targetKbId) {
      return;
    }
    let cancelled = false;
    const kbId = targetKbId;
    fetch(`/api/admin/pages/${pageId}/relocate?targetKbId=${encodeURIComponent(kbId)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.message === "string" ? data.message : "Could not load destination pages.");
        }
        if (!cancelled) {
          setParents(Array.isArray(data.parents) ? (data.parents as ParentOption[]) : []);
          setParentsForKb(kbId);
          setParentPath("");
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setParents([]);
          setParentsForKb(kbId);
          setError(caught instanceof Error ? caught.message : "Could not load destination pages.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, targetKbId]);

  async function submit() {
    if (!targetKbId) {
      setError("Choose a destination knowledge base.");
      return;
    }
    if (loadingParents) {
      setError("Still loading destination pages. Try again in a moment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}/relocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          targetKbId,
          parentPath: effectiveParentPath ? effectiveParentPath.split("/") : [],
          includeChildren: mode === "move" ? true : includeChildren,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Could not relocate the page.");
      }
      onComplete({
        mode,
        pageId: typeof data.pageId === "string" ? data.pageId : pageId,
        editHref: typeof data.editHref === "string" ? data.editHref : `/admin/pages/${pageId}`,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not relocate the page.");
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  const kbOptions = availableKbs.map((kb) => ({
    label: kb.visibility === "private" ? `${kb.title} (Private)` : kb.title,
    value: kb.id,
    description: kb.slug,
    searchText: `${kb.title} ${kb.slug} ${kb.visibility === "private" ? "private" : "public"}`,
  }));

  const parentOptions = [
    { label: "Top level (no parent)", value: "" },
    ...parents.map((parent) => ({
      label: `${"— ".repeat(Math.max(0, parent.depth - 1))}${parent.title}`,
      value: parent.path,
      searchText: parent.title,
    })),
  ];

  return createPortal(
    <div className="media-picker__overlay" onClick={onCancel} role="presentation">
      <div
        aria-labelledby={headingId}
        aria-modal="true"
        className="media-picker link-dialog"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong id={headingId}>Copy or move page</strong>
          <button aria-label="Cancel" className="icon-button" onClick={onCancel} type="button">
            ✕
          </button>
        </div>
        <div className="media-picker__body form">
          <p className="meta">
            Relocate &ldquo;{pageTitle}&rdquo; to another knowledge base. Copies become drafts.
            Moves keep status and leave redirects from the old public URL when the page was published.
          </p>

          <fieldset className="fieldset" style={{ margin: 0 }}>
            <legend className="sr-only">Mode</legend>
            <label className="checkbox-inline">
              <input
                checked={mode === "copy"}
                name="relocate-mode"
                onChange={() => setMode("copy")}
                type="radio"
              />
              <span>Copy (new page in destination)</span>
            </label>
            <label className="checkbox-inline">
              <input
                checked={mode === "move"}
                disabled={moveTargets.length === 0}
                name="relocate-mode"
                onChange={() => setMode("move")}
                type="radio"
              />
              <span>Move (leave source KB)</span>
            </label>
          </fieldset>

          {kbOptions.length === 0 ? (
            <p className="error">No accessible destination knowledge bases.</p>
          ) : (
            <>
              <DropdownSelect
                disabled={busy}
                label="Destination knowledge base"
                onChange={setSelectedKbId}
                options={kbOptions}
                searchable={kbOptions.length > 6}
                value={targetKbId}
              />
              <DropdownSelect
                disabled={busy || loadingParents}
                emptyMessage={loadingParents ? "Loading…" : "No parent pages."}
                label="Nest under"
                onChange={setParentPath}
                options={parentOptions}
                searchLabel="Search parent pages"
                searchPlaceholder="Search parent pages..."
                value={parentPath}
              />
              {mode === "copy" && (
                <label className="checkbox-inline">
                  <input
                    checked={includeChildren}
                    disabled={busy}
                    onChange={(event) => setIncludeChildren(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Include child pages</span>
                </label>
              )}
              {mode === "move" && (
                <p className="meta">
                  Child pages move with this page. If this page is the KB homepage, that homepage
                  setting is cleared.
                </p>
              )}
            </>
          )}

          {error && <p className="error">{error}</p>}

          <div className="admin-inline-actions">
            <button className="button button--ghost" disabled={busy} onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className="button"
              disabled={busy || kbOptions.length === 0 || !targetKbId || loadingParents}
              onClick={() => void submit()}
              type="button"
            >
              {busy ? "Working…" : loadingParents ? "Loading…" : mode === "copy" ? "Copy page" : "Move page"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
