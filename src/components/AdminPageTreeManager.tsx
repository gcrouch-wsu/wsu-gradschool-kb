"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { KbPage, KnowledgeBase, PageStatus } from "@/lib/types";

type PageItem = Pick<
  KbPage,
  "id" | "path" | "sortOrder" | "status" | "title" | "updatedDisplayDate" | "visibility"
>;

function pathKey(path: string[]) {
  return path.join("/");
}

function hasPathPrefix(path: string[], prefix: string[]) {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function normalizeSiblingOrders(pages: PageItem[]) {
  const grouped = new Map<string, PageItem[]>();
  for (const page of pages) {
    const parent = pathKey(page.path.slice(0, -1));
    grouped.set(parent, [...(grouped.get(parent) ?? []), page]);
  }
  const nextById = new Map(pages.map((page) => [page.id, { ...page }]));
  for (const siblings of grouped.values()) {
    siblings
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
      .forEach((page, index) => {
        nextById.get(page.id)!.sortOrder = (index + 1) * 10;
      });
  }
  return pages.map((page) => nextById.get(page.id)!);
}

function sortedPages(pages: PageItem[]) {
  const childrenByParent = new Map<string, PageItem[]>();
  for (const page of pages) {
    const parent = pathKey(page.path.slice(0, -1));
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), page]);
  }
  const sortSiblingGroup = (items: PageItem[]) =>
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const output: PageItem[] = [];
  const visit = (parentPath: string[]) => {
    const children = sortSiblingGroup([...(childrenByParent.get(pathKey(parentPath)) ?? [])]);
    for (const child of children) {
      output.push(child);
      visit(child.path);
    }
  };
  visit([]);
  return output;
}

function movePage(pages: PageItem[], pageId: string, parentPath: string[], sortOrder: number) {
  const moving = pages.find((page) => page.id === pageId);
  if (!moving) {
    return pages;
  }
  if (hasPathPrefix(parentPath, moving.path)) {
    return pages;
  }

  const oldPath = moving.path;
  const newPath = [...parentPath, moving.path[moving.path.length - 1]];
  return normalizeSiblingOrders(
    pages.map((page) => {
      if (page.id === moving.id) {
        return { ...page, path: newPath, sortOrder };
      }
      if (hasPathPrefix(page.path, oldPath) && page.path.length > oldPath.length) {
        return { ...page, path: [...newPath, ...page.path.slice(oldPath.length)] };
      }
      return page;
    }),
  );
}

export function AdminPageTreeManager({
  initialPages,
  kb,
}: {
  initialPages: PageItem[];
  kb: KnowledgeBase;
}) {
  const [pages, setPages] = useState(() => normalizeSiblingOrders(initialPages));
  const [showArchived, setShowArchived] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  const visiblePages = useMemo(
    () => (showArchived ? pages : pages.filter((page) => page.status !== "archived")),
    [pages, showArchived],
  );
  const displayPages = useMemo(() => sortedPages(visiblePages), [visiblePages]);
  const archivedCount = useMemo(
    () => pages.filter((page) => page.status === "archived").length,
    [pages],
  );

  function dropBefore(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      return;
    }
    const target = pages.find((page) => page.id === targetId);
    if (!target) {
      return;
    }
    const targetParent = target.path.slice(0, -1);
    setPages((current) => movePage(current, draggedId, targetParent, target.sortOrder - 1));
    setDraggedId(null);
  }

  function nestUnder(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      return;
    }
    const target = pages.find((page) => page.id === targetId);
    if (!target) {
      return;
    }
    const childOrders = pages
      .filter((page) => pathKey(page.path.slice(0, -1)) === pathKey(target.path))
      .map((page) => page.sortOrder);
    setPages((current) => movePage(current, draggedId, target.path, Math.max(0, ...childOrders) + 10));
    setDraggedId(null);
  }

  async function saveLayout() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/pages/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kbId: kb.id,
          items: pages.map((page) => ({
            pageId: page.id,
            parentPath: page.path.slice(0, -1),
            sortOrder: page.sortOrder,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not save page tree.");
      }
      setMessage("Page tree saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save page tree.");
    } finally {
      setBusy(false);
    }
  }

  async function setPageStatus(pageId: string, status: PageStatus) {
    setStatusBusyId(pageId);
    setError(null);
    setMessage(null);
    setIssues([]);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}/status`, {
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
      setPages((current) =>
        current.map((page) =>
          page.id === pageId
            ? { ...page, status, updatedDisplayDate: new Date().toISOString().slice(0, 10) }
            : page,
        ),
      );
      setMessage(
        status === "published"
          ? "Page published."
          : status === "archived"
            ? "Page archived. It is hidden from the public site."
            : "Page saved as draft.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update page status.");
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleDelete(pageId: string, title: string) {
    const confirmation = prompt(`Are you sure you want to delete "${title}"? This cannot be undone. All child pages will also be removed. To confirm, type "DELETE" below.`);
    if (confirmation !== "DELETE") return;

    setStatusBusyId(pageId);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Could not delete page.");
      }
      
      const deletedPage = pages.find(p => p.id === pageId);
      if (deletedPage) {
        // Remove page and its descendants from local state
        setPages(current => current.filter(p => !hasPathPrefix(p.path, deletedPage.path)));
      }
      setMessage("Page deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete page.");
    } finally {
      setStatusBusyId(null);
    }
  }

  return (
    <div className="page-tree-manager">
      {error && <p className="error">{error}</p>}
      {issues.length > 0 && (
        <div className="error" role="alert">
          <strong>Publishing is blocked until these are fixed:</strong>
          <ul className="issue-list">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {message && <p className="alert alert--success">{message}</p>}
      <div className="admin-actions">
        <button className="button" disabled={busy} onClick={saveLayout} type="button">
          {busy ? "Saving..." : "Save page tree"}
        </button>
        {archivedCount > 0 && (
          <label className="meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <input
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              type="checkbox"
            />
            Show archived ({archivedCount})
          </label>
        )}
      </div>
      <ul className="tree-editor" aria-label={`${kb.title} page tree editor`}>
        {displayPages.map((page) => {
          const depth = Math.max(0, page.path.length - 1);
          return (
            <li
              className="tree-editor__item"
              draggable
              key={page.id}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDraggedId(page.id)}
              onDrop={() => dropBefore(page.id)}
              style={{ marginLeft: `${depth * 1.25}rem` }}
            >
              <div className="tree-editor__row">
                <span className="tree-editor__handle" aria-hidden="true">
                  ::
                </span>
                <div>
                  <strong>{page.title}</strong>
                  {page.path.length === 1 && <span className="badge badge--section"> Section</span>}
                  {page.status === "draft" && <span className="badge badge--draft"> Draft</span>}
                  {page.status === "archived" && <span className="badge badge--archived"> Archived</span>}
                  {page.visibility === "staff" && <span className="badge badge--staff"> Staff</span>}
                  <div className="meta">
                    /{page.path.join("/")} · Updated {page.updatedDisplayDate} ·{" "}
                    {page.visibility === "staff" ? "Staff only" : "Public"}
                  </div>
                </div>
                <div className="tree-editor__actions">
                  <button
                    className="button button--ghost button--small"
                    disabled={!draggedId || draggedId === page.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => nestUnder(page.id)}
                    type="button"
                  >
                    Nest dragged
                  </button>
                  <Link className="button button--small" href={`/admin/pages/${page.id}`}>
                    Edit / save
                  </Link>
                  {page.status === "archived" ? (
                    <button
                      className="button button--small"
                      disabled={statusBusyId === page.id}
                      onClick={() => setPageStatus(page.id, "draft")}
                      type="button"
                    >
                      {statusBusyId === page.id ? "Restoring..." : "Restore to draft"}
                    </button>
                  ) : page.status === "draft" ? (
                    <>
                      <button
                        className="button button--small"
                        disabled={statusBusyId === page.id}
                        onClick={() => setPageStatus(page.id, "published")}
                        type="button"
                      >
                        {statusBusyId === page.id ? "Publishing..." : "Publish"}
                      </button>
                      <button
                        className="button button--ghost button--small"
                        disabled={statusBusyId === page.id}
                        onClick={() => setPageStatus(page.id, "archived")}
                        type="button"
                      >
                        {statusBusyId === page.id ? "Archiving..." : "Archive"}
                      </button>
                      <button
                        className="button button--ghost button--small"
                        style={{ color: "var(--wsu-crimson)" }}
                        disabled={statusBusyId === page.id}
                        onClick={() => handleDelete(page.id, page.title)}
                        type="button"
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="button button--ghost button--small"
                        disabled={statusBusyId === page.id}
                        onClick={() => setPageStatus(page.id, "draft")}
                        type="button"
                      >
                        {statusBusyId === page.id ? "Unpublishing..." : "Unpublish"}
                      </button>
                      <button
                        className="button button--ghost button--small"
                        disabled={statusBusyId === page.id}
                        onClick={() => setPageStatus(page.id, "archived")}
                        type="button"
                      >
                        {statusBusyId === page.id ? "Archiving..." : "Archive"}
                      </button>
                      <button
                        className="button button--ghost button--small"
                        style={{ color: "var(--wsu-crimson)" }}
                        disabled={statusBusyId === page.id}
                        onClick={() => handleDelete(page.id, page.title)}
                        type="button"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
