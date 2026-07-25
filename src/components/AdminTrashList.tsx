"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type TrashPageRow = {
  pageId: string;
  title: string;
  path: string;
  kbId: string;
  kbTitle: string;
  updatedDisplayDate: string;
  hasChildren: boolean;
};

export function AdminTrashList({
  pages,
  canDelete,
}: {
  pages: TrashPageRow[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(pages);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function restore(pageId: string) {
    setBusyId(pageId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message ?? "Could not restore page.");
      }
      setRows((current) => current.filter((row) => row.pageId !== pageId));
      setMessage("Restored to draft.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore page.");
    } finally {
      setBusyId(null);
    }
  }

  async function purge(page: TrashPageRow) {
    if (!canDelete) return;
    if (
      !window.confirm(
        `Permanently delete “${page.title}”? This cannot be undone.` +
          (page.hasChildren ? " This page still has child pages — delete those first." : ""),
      )
    ) {
      return;
    }
    setBusyId(page.pageId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.pageId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message ?? "Could not delete page.");
      }
      setRows((current) => current.filter((row) => row.pageId !== page.pageId));
      setMessage("Page permanently deleted.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete page.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="meta">Trash is empty. Archived pages will appear here.</p>;
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      {message && <p className="alert alert--success">{message}</p>}
      <ul className="import-outline">
        {rows.map((page) => (
          <li key={page.pageId}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", alignItems: "center" }}>
              <div>
                <Link href={`/admin/pages/${page.pageId}`}>{page.title}</Link>
                <span className="meta">
                  {" "}
                  · {page.kbTitle} · /{page.path} · archived {page.updatedDisplayDate}
                  {page.hasChildren ? " · has children" : ""}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                <button
                  className="button button--small"
                  disabled={busyId === page.pageId}
                  onClick={() => void restore(page.pageId)}
                  type="button"
                >
                  {busyId === page.pageId ? "Working…" : "Restore to draft"}
                </button>
                {canDelete ? (
                  <button
                    className="button button--small button--ghost"
                    disabled={busyId === page.pageId || page.hasChildren}
                    onClick={() => void purge(page)}
                    title={page.hasChildren ? "Delete or move child pages first." : undefined}
                    type="button"
                  >
                    Delete permanently
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
