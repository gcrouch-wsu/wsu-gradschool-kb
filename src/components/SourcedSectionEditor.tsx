"use client";

import { useState } from "react";
import type { ContentBlock } from "@/lib/types";

type SourcedBlock = Extract<ContentBlock, { type: "sourced" }>;

interface ImportResponse {
  sourceUrl: string;
  sourceAnchor?: string;
  headingText?: string;
  retrievedAt: string;
  contentHash: string;
  blocks: ContentBlock[];
  message?: string;
}

export function SourcedSectionEditor({
  block,
  onChange,
}: {
  block: SourcedBlock;
  onChange: (block: SourcedBlock) => void;
}) {
  const [urlInput, setUrlInput] = useState(
    block.sourceUrl ? `${block.sourceUrl}${block.sourceAnchor ? `#${block.sourceAnchor}` : ""}` : "",
  );
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedHtml, setPastedHtml] = useState("");
  const [busy, setBusy] = useState<"import" | "check" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasContent = block.blocks.length > 0 && Boolean(block.contentHash);

  async function runImport(body: Record<string, unknown>, action: "import" | "refresh") {
    setBusy("import");
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/sourced-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as ImportResponse | null;
      if (!response.ok || !data || !Array.isArray(data.blocks)) {
        setError(data?.message ?? "Could not import from the source.");
        return;
      }
      onChange({
        ...block,
        sourceUrl: data.sourceUrl,
        sourceAnchor: data.sourceAnchor,
        headingText: data.headingText,
        retrievedAt: data.retrievedAt,
        contentHash: data.contentHash,
        blocks: data.blocks,
      });
      setStatus(
        action === "refresh"
          ? "Content refreshed from the source. Save the page to keep it."
          : "Content imported. Save the page to keep it.",
      );
      setPasteOpen(false);
      setPastedHtml("");
    } finally {
      setBusy(null);
    }
  }

  async function checkSource() {
    setBusy("check");
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/sourced-content/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: block.sourceUrl,
          anchor: block.sourceAnchor,
          contentHash: block.contentHash,
        }),
      });
      const data = (await response.json().catch(() => null)) as { state?: string } | null;
      if (!response.ok || !data?.state) {
        setError("Could not check the source right now.");
        return;
      }
      if (data.state === "unchanged") {
        setStatus("The source section has not changed since it was imported.");
      } else if (data.state === "changed") {
        setStatus("The source section has changed. Use Refresh from source, then review before publishing.");
      } else if (data.state === "anchor_missing") {
        setError(
          "The section anchor no longer exists on the source page — it may have been renamed. Re-import with the new link.",
        );
      } else {
        setError("The source page is unreachable right now. The published page is unaffected.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sourced-editor form">
      <p className="meta">
        Content copied from an approved external source (e.g. the Graduate School Policies &amp;
        Procedures page) with a visible source attribution. The content is a snapshot: it does not
        change until you refresh it here and save.
      </p>
      {hasContent ? (
        <p className="meta">
          Imported <strong>{block.headingText || block.sourceAnchor || "section"}</strong>
          {block.retrievedAt ? ` on ${block.retrievedAt.slice(0, 10)}` : ""} ({block.blocks.length}{" "}
          block{block.blocks.length === 1 ? "" : "s"}).
        </p>
      ) : (
        <p className="meta">No content imported yet. Paste a source section link below.</p>
      )}
      <label>
        <span className="meta">Source section link (URL with #section-anchor)</span>
        <input
          className="input"
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://gradschool.wsu.edu/graduate-school-policies-and-procedures/#graduate-program-faculty"
          value={urlInput}
        />
      </label>
      <div className="field-row">
        <button
          className="button button--small"
          disabled={busy !== null || !urlInput.trim()}
          onClick={() => runImport({ url: urlInput.trim() }, hasContent ? "refresh" : "import")}
          type="button"
        >
          {busy === "import" ? "Working…" : hasContent ? "Refresh from source" : "Import from source"}
        </button>
        {hasContent && (
          <button
            className="button button--small"
            disabled={busy !== null}
            onClick={checkSource}
            type="button"
          >
            {busy === "check" ? "Checking…" : "Check source for changes"}
          </button>
        )}
        <button
          className="button button--small"
          disabled={busy !== null}
          onClick={() => setPasteOpen((open) => !open)}
          type="button"
        >
          {pasteOpen ? "Hide paste option" : "Paste HTML instead"}
        </button>
      </div>
      {pasteOpen && (
        <div className="form">
          <label>
            <span className="meta">
              Paste the section HTML copied from the source page (fallback when the server cannot
              reach the source). The link above is still recorded as the source.
            </span>
            <textarea
              className="input"
              onChange={(e) => setPastedHtml(e.target.value)}
              rows={6}
              value={pastedHtml}
            />
          </label>
          <button
            className="button button--small"
            disabled={busy !== null || !pastedHtml.trim() || !urlInput.trim()}
            onClick={() => runImport({ url: urlInput.trim(), html: pastedHtml }, "import")}
            type="button"
          >
            Import pasted HTML
          </button>
        </div>
      )}
      <div className="field-row">
        <label>
          <span className="meta">Attribution label (optional)</span>
          <input
            className="input"
            onChange={(e) => onChange({ ...block, label: e.target.value || undefined })}
            placeholder="Default: site — section name"
            value={block.label ?? ""}
          />
        </label>
        <label className="excerpt-editor__checkbox">
          <input
            checked={Boolean(block.openInNewTab)}
            onChange={(e) => onChange({ ...block, openInNewTab: e.target.checked || undefined })}
            type="checkbox"
          />
          <span className="meta">Open the source link in a new tab</span>
        </label>
      </div>
      {status && <p className="meta" role="status">{status}</p>}
      {error && <p className="alert editor-format-hint">{error}</p>}
    </div>
  );
}
