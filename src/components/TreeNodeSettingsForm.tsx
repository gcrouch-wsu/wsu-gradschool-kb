"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KbPage, PageStatus, PageVisibility } from "@/lib/types";

// Settings form for tree nodes that are structure, not content: group
// headings and links have no block editor, just identity and destination.
export function TreeNodeSettingsForm({ page }: { page: KbPage }) {
  const router = useRouter();
  const isLink = page.nodeKind === "link";
  const [title, setTitle] = useState(page.title);
  const [status, setStatus] = useState<PageStatus>(page.status === "published" ? "published" : "draft");
  const [visibility, setVisibility] = useState<PageVisibility>(page.visibility);
  const [linkUrl, setLinkUrl] = useState(page.linkUrl ?? "");
  const [linkNewTab, setLinkNewTab] = useState(Boolean(page.linkNewTab));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug: page.slug,
          parentPath: page.path.slice(0, -1),
          summary: "",
          status,
          visibility,
          blocks: [],
          linkUrl: isLink ? linkUrl : "",
          linkNewTab: isLink ? linkNewTab : false,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const issues = Array.isArray(data?.issues) ? ` ${data.issues.join(" ")}` : "";
        throw new Error(`${data?.message ?? "Could not save."}${issues}`);
      }
      setMessage("Saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form card" onSubmit={handleSubmit}>
      {error && <p className="alert alert--error">{error}</p>}
      {message && <p className="alert alert--success">{message}</p>}
      <label>
        <span className="meta">Title</span>
        <input className="input" onChange={(e) => setTitle(e.target.value)} required value={title} />
      </label>
      {isLink && (
        <>
          <label>
            <span className="meta">Link destination</span>
            <input
              className="input"
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://… or /kb/other-kb/page"
              required
              value={linkUrl}
            />
          </label>
          <label className="attribution-checkbox">
            <input checked={linkNewTab} onChange={(e) => setLinkNewTab(e.target.checked)} type="checkbox" />
            <span>Open in a new tab</span>
          </label>
        </>
      )}
      <div className="field-row">
        <label>
          <span className="meta">Status</span>
          <select className="input" onChange={(e) => setStatus(e.target.value as PageStatus)} value={status}>
            <option value="draft">Draft (hidden from readers)</option>
            <option value="published">Published (shown in the tree)</option>
          </select>
        </label>
        <label>
          <span className="meta">Visibility</span>
          <select
            className="input"
            onChange={(e) => setVisibility(e.target.value as PageVisibility)}
            value={visibility}
          >
            <option value="public">Public</option>
            <option value="staff">Staff only (also hides everything nested under it)</option>
          </select>
        </label>
      </div>
      <p className="meta">
        Nest pages under this item or move it by dragging in the page tree. It has no content of its
        own{isLink ? " — it sends readers to the destination above" : ""}.
      </p>
      <div className="admin-actions">
        <button className="button" disabled={busy || !title.trim()} type="submit">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
