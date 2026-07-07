"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { parseJsonResponse } from "@/lib/http";
import type { ContentBlock, StagedImportDetail, StagedImportMedia } from "@/lib/types";

export interface ImportKbOption {
  id: string;
  title: string;
  slug: string;
  pages: { path: string; title: string; depth: number }[];
}

export function AdminStagedImportReview({
  initialDetail,
  kbOptions,
}: {
  initialDetail: StagedImportDetail;
  kbOptions: ImportKbOption[];
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [kbId, setKbId] = useState(detail.import.kbId);
  const [parentPath, setParentPath] = useState(detail.import.parentPath.join("/"));
  const [title, setTitle] = useState(detail.import.title);
  const [slug, setSlug] = useState(detail.import.slug);
  const [summary, setSummary] = useState(detail.import.summary);
  const [visibility, setVisibility] = useState(detail.import.visibility);
  const [media, setMedia] = useState(detail.media);
  const [busy, setBusy] = useState<"save" | "commit" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdPageId, setCreatedPageId] = useState<string | null>(null);

  const activeKb = useMemo(() => kbOptions.find((kb) => kb.id === kbId), [kbOptions, kbId]);

  const headingOutline = useMemo(
    () =>
      detail.import.blocks
        .filter((block): block is Extract<ContentBlock, { type: "heading" }> => block.type === "heading")
        .map((block) => ({ level: block.level, text: block.text })),
    [detail.import.blocks],
  );

  const blockCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    detail.import.blocks.forEach((block) => {
      counts[block.type] = (counts[block.type] ?? 0) + 1;
    });
    return counts;
  }, [detail.import.blocks]);

  const imageUrls = useMemo(
    () =>
      detail.import.blocks
        .filter((block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image")
        .map((block) => block.url)
        .filter((url): url is string => Boolean(url)),
    [detail.import.blocks],
  );

  function updateMediaRow(id: string, patch: Partial<StagedImportMedia>) {
    setMedia((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function saveReview() {
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      await persistReview();
      setMessage("Review saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save review.");
    } finally {
      setBusy(null);
    }
  }

  async function persistReview() {
    const response = await fetch(`/api/admin/import/staged/${detail.import.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        slug,
        summary,
        visibility,
        parentPath: parentPath ? parentPath.split("/") : [],
        media: media.map((row) => ({
          id: row.id,
          altText: row.altText,
          proposedTitle: row.proposedTitle,
          reviewStatus: row.reviewStatus,
        })),
      }),
    });
    const data = await parseJsonResponse<StagedImportDetail & { message?: string }>(
      response,
      "Could not save review.",
    );
    if (!response.ok) {
      throw new Error(data.message ?? "Could not save review.");
    }
    setDetail({ import: data.import, media: data.media, kbSlug: data.kbSlug });
    setMedia(data.media);
    return data;
  }

  async function commitImport() {
    setBusy("commit");
    setError(null);
    setMessage(null);
    try {
      await persistReview();
      const response = await fetch(`/api/admin/import/staged/${detail.import.id}/commit`, {
        method: "POST",
      });
      const data = await parseJsonResponse<{ message?: string; url?: string }>(
        response,
        "Could not commit the import.",
      );
      if (!response.ok) {
        throw new Error(data.message ?? "Could not commit the import.");
      }
      setCreatedUrl(data.url ?? null);
      setCreatedPageId(data.pageId ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not commit the import.");
    } finally {
      setBusy(null);
    }
  }

  async function discardImport() {
    if (!window.confirm("Delete this staged import and all temporary review data?")) {
      return;
    }
    setBusy("discard");
    setError(null);
    try {
      const response = await fetch(`/api/admin/import/staged/${detail.import.id}`, {
        method: "DELETE",
      });
      const data = await parseJsonResponse<{ message?: string }>(response, "Could not delete staged import.");
      if (!response.ok) {
        throw new Error(data.message ?? "Could not delete staged import.");
      }
      window.location.href = "/admin/import";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete staged import.");
    } finally {
      setBusy(null);
    }
  }

  if (createdUrl !== null) {
    return (
      <div className="card">
        <h2>Draft page created</h2>
        <p>Staged import committed. The staging record was removed.</p>
        <p>
          {createdUrl && (
            <a className="button" href={createdUrl}>
              View draft page
            </a>
          )}
        </p>
        {createdPageId && (
          <p>
            <a className="button button--ghost" href={`/admin/pages/${createdPageId}`}>
              Edit or publish
            </a>
          </p>
        )}
        <p className="meta">
          <Link href="/admin/import">Back to imports</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="import-grid">
      <form
        className="form card"
        onSubmit={(event) => {
          event.preventDefault();
          void commitImport();
        }}
      >
        <h2>Review staged import</h2>
        <p className="meta">
          File: {detail.import.originalFilename} · Status: {detail.import.status} · Updated{" "}
          {detail.import.updatedAt}
        </p>
        {error && <p className="alert">{error}</p>}
        {message && <p className="alert alert--success">{message}</p>}

        {detail.import.messages.length > 0 && (
          <div className="alert">
            <strong>Import notes</strong>
            <ul className="issue-list">
              {detail.import.messages.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        <label>
          <span className="meta">Knowledge base</span>
          <select
            className="input"
            disabled
            onChange={(e) => setKbId(e.target.value)}
            value={kbId}
          >
            {kbOptions.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="meta">Nest under (parent page)</span>
          <select
            className="input"
            onChange={(e) => setParentPath(e.target.value)}
            value={parentPath}
          >
            <option value="">— Top level —</option>
            {activeKb?.pages.map((page) => (
              <option key={page.path} value={page.path}>
                {`${"\u00A0\u00A0".repeat(Math.max(0, page.depth - 1))}${page.title}`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="meta">Title</span>
          <input className="input" onChange={(e) => setTitle(e.target.value)} value={title} />
        </label>

        <label>
          <span className="meta">Slug</span>
          <input className="input" onChange={(e) => setSlug(e.target.value)} value={slug} />
        </label>

        <label>
          <span className="meta">Summary</span>
          <textarea
            className="input"
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            value={summary}
          />
        </label>

        <label>
          <span className="meta">Visibility</span>
          <select
            className="input"
            onChange={(e) => setVisibility(e.target.value as "public" | "staff")}
            value={visibility}
          >
            <option value="public">Public</option>
            <option value="staff">Staff only</option>
          </select>
        </label>

        {media.length > 0 && (
          <section>
            <h3>Images ({media.length})</h3>
            <p className="meta">
              Approve images to include on the draft page. Rejected images are omitted. Add alt text
              before publishing.
            </p>
            <ul className="import-outline">
              {media.map((row) => (
                <li key={row.id} style={{ marginBottom: "1rem" }}>
                  <div className="meta">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt=""
                      src={row.temporaryUrl}
                      style={{ maxWidth: "200px", display: "block", marginBottom: "0.5rem" }}
                    />
                  </div>
                  <label>
                    <span className="meta">Alt text</span>
                    <input
                      className="input"
                      onChange={(e) => updateMediaRow(row.id, { altText: e.target.value })}
                      value={row.altText}
                    />
                  </label>
                  <label>
                    <span className="meta">Asset title</span>
                    <input
                      className="input"
                      onChange={(e) => updateMediaRow(row.id, { proposedTitle: e.target.value })}
                      value={row.proposedTitle}
                    />
                  </label>
                  <label>
                    <span className="meta">Review</span>
                    <select
                      className="input"
                      onChange={(e) =>
                        updateMediaRow(row.id, {
                          reviewStatus: e.target.value as StagedImportMedia["reviewStatus"],
                        })
                      }
                      value={row.reviewStatus}
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="import-actions">
          <button className="button button--ghost" disabled={busy !== null} onClick={() => saveReview()} type="button">
            {busy === "save" ? "Saving…" : "Save review"}
          </button>
          <button className="button" disabled={busy !== null || !title} type="submit">
            {busy === "commit" ? "Committing…" : "Commit to draft page"}
          </button>
          <button
            className="button button--ghost"
            disabled={busy !== null}
            onClick={() => discardImport()}
            type="button"
          >
            {busy === "discard" ? "Deleting…" : "Discard staging"}
          </button>
          <Link className="button button--ghost" href="/admin/import">
            Back to imports
          </Link>
        </div>
      </form>

      <aside className="card import-preview">
        <h2>Preview</h2>
        <p className="meta">
          {Object.entries(blockCounts)
            .map(([type, count]) => `${count} ${type}`)
            .join(" · ")}
        </p>
        {headingOutline.length > 0 && (
          <>
            <h3>Outline</h3>
            <ol className="import-outline">
              {headingOutline.map((heading, index) => (
                <li key={`${heading.level}-${index}`}>
                  {heading.level === 3 ? "— " : ""}
                  {heading.text}
                </li>
              ))}
            </ol>
          </>
        )}
        {imageUrls.length > 0 && (
          <>
            <h3>Thumbnails</h3>
            <div className="import-thumbs">
              {imageUrls.map((url, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" key={`${url}-${index}`} src={url} />
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
