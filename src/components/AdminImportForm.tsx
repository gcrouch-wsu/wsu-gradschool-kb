"use client";

import { useMemo, useState } from "react";
import type { ContentBlock } from "@/lib/types";

export interface ImportKbOption {
  id: string;
  title: string;
  slug: string;
  pages: { path: string; title: string; depth: number }[];
}

interface ParsedResponse {
  fileName: string;
  title: string | null;
  blocks: ContentBlock[];
  messages: string[];
}

function suggestSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function AdminImportForm({ kbOptions }: { kbOptions: ImportKbOption[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdPageId, setCreatedPageId] = useState<string | null>(null);

  const [kbId, setKbId] = useState(kbOptions[0]?.id ?? "");
  const [parentPath, setParentPath] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [visibility, setVisibility] = useState<"public" | "staff">("public");

  const activeKb = useMemo(() => kbOptions.find((kb) => kb.id === kbId), [kbOptions, kbId]);

  const headingOutline = useMemo(() => {
    if (!parsed) {
      return [];
    }
    return parsed.blocks
      .filter((block): block is Extract<ContentBlock, { type: "heading" }> => block.type === "heading")
      .map((block) => ({ level: block.level, text: block.text }));
  }, [parsed]);

  const blockCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parsed?.blocks.forEach((block) => {
      counts[block.type] = (counts[block.type] ?? 0) + 1;
    });
    return counts;
  }, [parsed]);

  const imageUrls = useMemo(() => {
    if (!parsed) {
      return [];
    }
    return parsed.blocks
      .filter((block): block is Extract<ContentBlock, { type: "image" }> => block.type === "image")
      .map((block) => block.url)
      .filter((url): url is string => Boolean(url));
  }, [parsed]);

  async function handleParse(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a .docx file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setCreatedUrl(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/import/parse", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not parse the file.");
      }
      const result = data as ParsedResponse;
      setParsed(result);
      const derivedTitle = result.title ?? result.fileName.replace(/\.docx$/i, "");
      setTitle(derivedTitle);
      setSlug(suggestSlug(derivedTitle));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not parse the file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsed) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kbId,
          title,
          slug,
          summary,
          visibility,
          parentPath: parentPath ? parentPath.split("/") : [],
          blocks: parsed.blocks,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not create the page.");
      }
      setCreatedUrl(data.url ?? null);
      setCreatedPageId(data.pageId ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the page.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setParsed(null);
    setError(null);
    setCreatedUrl(null);
    setCreatedPageId(null);
    setTitle("");
    setSlug("");
    setSummary("");
    setParentPath("");
  }

  if (createdUrl !== null) {
    return (
      <div className="card">
        <h2>Draft page created</h2>
        <p>Your document was imported as a draft page.</p>
        <p>
          {createdUrl ? (
            <a className="button" href={createdUrl}>
              View page
            </a>
          ) : (
            <span className="meta">Saved. Find it in the knowledge base navigation.</span>
          )}
        </p>
        {createdPageId && (
          <p>
            <a className="button button--ghost" href={`/admin/pages/${createdPageId}`}>
              Edit or publish draft
            </a>
          </p>
        )}
        <p className="meta">
          <button className="button button--ghost" onClick={reset} type="button">
            Import another document
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="import-grid">
      <form className="form card" onSubmit={parsed ? handleCommit : handleParse}>
        {error && <p className="alert">{error}</p>}

        {!parsed && (
          <>
            <label>
              <span className="meta">Word document (.docx)</span>
              <input
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
            <button className="button" disabled={busy || !file} type="submit">
              {busy ? "Reading…" : "Parse document"}
            </button>
          </>
        )}

        {parsed && (
          <>
            <label>
              <span className="meta">Knowledge base</span>
              <select
                className="input"
                onChange={(event) => {
                  setKbId(event.target.value);
                  setParentPath("");
                }}
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
                onChange={(event) => setParentPath(event.target.value)}
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
              <input
                className="input"
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>

            <label>
              <span className="meta">Slug</span>
              <input
                className="input"
                onChange={(event) => setSlug(event.target.value)}
                value={slug}
              />
            </label>

            <label>
              <span className="meta">Summary (optional)</span>
              <input
                className="input"
                onChange={(event) => setSummary(event.target.value)}
                value={summary}
              />
            </label>

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

            <div className="import-actions">
              <button className="button" disabled={busy || !title} type="submit">
                {busy ? "Saving…" : "Create draft page"}
              </button>
              <button className="button button--ghost" disabled={busy} onClick={reset} type="button">
                Cancel
              </button>
            </div>
          </>
        )}
      </form>

      {parsed && (
        <aside className="card import-preview" aria-label="Import preview">
          <h2>Preview</h2>
          <p className="meta">
            {Object.entries(blockCounts)
              .map(([type, count]) => `${count} ${type}`)
              .join(" · ") || "No content blocks"}
          </p>

          {parsed.messages.length > 0 && (
            <ul className="import-messages">
              {parsed.messages.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          )}

          <h3>Outline</h3>
          {headingOutline.length === 0 ? (
            <p className="meta">No headings detected.</p>
          ) : (
            <ol className="import-outline">
              {headingOutline.map((heading, index) => (
                <li className={heading.level === 3 ? "import-outline__sub" : undefined} key={index}>
                  {heading.text}
                </li>
              ))}
            </ol>
          )}

          {imageUrls.length > 0 && (
            <>
              <h3>Images ({imageUrls.length})</h3>
              <div className="import-thumbs">
                {imageUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" key={url} loading="lazy" src={url} />
                ))}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
