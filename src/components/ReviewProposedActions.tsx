"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ProposedRow = {
  pageId: string;
  title: string;
  path: string;
  kbSlug: string;
  updatedDisplayDate: string;
};

export function ReviewProposedActions({
  pages,
  canApprove,
}: {
  pages: ProposedRow[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const visible = pages.filter((page) => !hidden.has(page.pageId));

  async function setStatus(pageId: string, status: "published" | "draft") {
    setBusyId(pageId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const issues = Array.isArray(data.issues) ? ` ${data.issues.join(" ")}` : "";
        throw new Error(`${data.message ?? "Could not update status."}${issues}`);
      }
      setHidden((current) => new Set(current).add(pageId));
      setMessage(status === "published" ? "Approved and published." : "Returned to draft.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update status.");
    } finally {
      setBusyId(null);
    }
  }

  if (visible.length === 0) {
    return <p className="meta">No pages are waiting for owner/admin approval.</p>;
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      {message && <p className="alert alert--success">{message}</p>}
      <ul className="import-outline">
        {visible.map((page) => (
          <li key={page.pageId}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", alignItems: "center" }}>
              <div>
                <Link href={`/admin/pages/${page.pageId}`}>{page.title}</Link>
                <span className="meta">
                  {" "}
                  · /{page.path} · updated {page.updatedDisplayDate}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {canApprove ? (
                  <button
                    className="button button--small"
                    disabled={busyId === page.pageId}
                    onClick={() => void setStatus(page.pageId, "published")}
                    type="button"
                  >
                    {busyId === page.pageId ? "Working…" : "Approve & publish"}
                  </button>
                ) : null}
                <button
                  className="button button--small button--ghost"
                  disabled={busyId === page.pageId}
                  onClick={() => void setStatus(page.pageId, "draft")}
                  type="button"
                >
                  Request changes
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
