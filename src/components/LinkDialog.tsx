"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatBytes } from "@/lib/format";
import type { LinkEditRequest } from "@/lib/page-editor-format";
import { useModalA11y } from "@/lib/use-modal-a11y";

interface LibraryDocument {
  id: string;
  title: string;
  slug: string;
  description: string;
  tags: string[];
  fileSizeBytes: number;
  url: string | null;
}

type Tab = "url" | "file";

export type LinkDialogSubmit =
  | { mode: "url"; url: string; text: string; newTab: boolean; assetId?: string }
  | { mode: "file-block"; assetId: string; label: string };

export function LinkDialog({
  hasTextSelection,
  kbId,
  kbSlug,
  onClose,
  onRemove,
  onSubmit,
  request,
}: {
  hasTextSelection: boolean;
  kbId: string;
  kbSlug: string;
  onClose: () => void;
  onRemove: () => void;
  onSubmit: (result: LinkDialogSubmit) => void;
  request: LinkEditRequest;
}) {
  const [tab, setTab] = useState<Tab>(request.assetId ? "file" : "url");
  const [url, setUrl] = useState(request.url);
  const [text, setText] = useState(request.text);
  const [newTab, setNewTab] = useState(request.newTab);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const allowFileBlock = !request.isEdit && !hasTextSelection;

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (!normalizedQuery) return true;
      return [doc.title, doc.slug, doc.description, doc.tags.join(" ")].some((field) =>
        field.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [documents, query]);

  useEffect(() => {
    if (tab !== "file") return;
    let active = true;
    (async () => {
      // Reset inside the async body, not the effect body: a synchronous setState in an
      // effect schedules an extra render pass before the fetch has even started.
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/assets?kbId=${encodeURIComponent(kbId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Could not load files.");
        if (!active) return;
        const docs = ((data.assets ?? []) as Array<LibraryDocument & { assetType?: string }>)
          .filter((asset) => asset.assetType === "document")
          .map((asset) => ({
            id: asset.id,
            title: asset.title,
            slug: asset.slug,
            description: asset.description ?? "",
            tags: Array.isArray(asset.tags) ? asset.tags : [],
            fileSizeBytes: Number(asset.fileSizeBytes) || 0,
            url: asset.url ?? null,
          }));
        setDocuments(docs);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load files.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [kbId, tab]);

  function publicFileUrl(doc: LibraryDocument) {
    return doc.url ?? `/kb/${kbSlug}/files/${doc.slug}`;
  }

  function submitUrl() {
    if (!url.trim()) return;
    onSubmit({ mode: "url", url: url.trim(), text: text.trim(), newTab, assetId: request.assetId });
  }

  function chooseFile(doc: LibraryDocument) {
    const fileUrl = publicFileUrl(doc);
    if (allowFileBlock) {
      onSubmit({ mode: "file-block", assetId: doc.id, label: doc.title });
      return;
    }
    onSubmit({
      mode: "url",
      url: fileUrl,
      text: text.trim() || doc.title,
      newTab,
      assetId: doc.id,
    });
  }

  async function uploadDocument(file: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kbId", kbId);
      const res = await fetch("/api/admin/assets/documents", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed.");
      const asset = data.asset as LibraryDocument | undefined;
      const label = asset?.title || file.name.replace(/\.[^.]+$/, "");
      if (allowFileBlock && asset?.id) {
        onSubmit({ mode: "file-block", assetId: asset.id, label });
        return;
      }
      onSubmit({
        mode: "url",
        url: data.url || (asset ? publicFileUrl(asset) : ""),
        text: text.trim() || label,
        newTab,
        assetId: asset?.id,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="media-picker__overlay" onClick={onClose} role="presentation">
      <div
        aria-label={request.isEdit ? "Edit link" : "Insert link"}
        aria-modal="true"
        className="media-picker link-dialog"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong>{request.isEdit ? "Edit link" : "Insert link"}</strong>
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="media-picker__tabs" role="tablist">
          <button
            aria-selected={tab === "url"}
            className={`media-picker__tab ${tab === "url" ? "is-active" : ""}`}
            onClick={() => setTab("url")}
            role="tab"
            type="button"
          >
            Web URL
          </button>
          <button
            aria-selected={tab === "file"}
            className={`media-picker__tab ${tab === "file" ? "is-active" : ""}`}
            onClick={() => setTab("file")}
            role="tab"
            type="button"
          >
            File from library
          </button>
        </div>

        <div className="media-picker__body form">
          {error && <p className="alert alert--error">{error}</p>}

          {tab === "url" && (
            <>
              <label>
                <span className="meta">Display text</span>
                <input
                  className="input"
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Text shown to readers"
                  value={text}
                />
              </label>
              <label>
                <span className="meta">URL</span>
                <input
                  className="input"
                  data-autofocus
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitUrl();
                  }}
                  placeholder="https://… , /kb/… , mailto:… , or #anchor"
                  value={url}
                />
              </label>
              <label className="checkbox-inline">
                <input checked={newTab} onChange={(e) => setNewTab(e.target.checked)} type="checkbox" />
                <span>Open in a new tab</span>
              </label>
              <p className="meta">
                New-tab links automatically get <code>rel=&quot;noopener noreferrer&quot;</code> for security.
              </p>
              <div className="link-dialog__actions">
                <button className="button" disabled={!url.trim()} onClick={submitUrl} type="button">
                  {request.isEdit ? "Update link" : "Insert link"}
                </button>
                {request.isEdit && request.anchor && (
                  <button className="button button--ghost" onClick={onRemove} type="button">
                    Remove link
                  </button>
                )}
                <button className="button button--ghost" onClick={onClose} type="button">
                  Cancel
                </button>
              </div>
            </>
          )}

          {tab === "file" && (
            <>
              <p className="meta">
                {allowFileBlock
                  ? "No text selected — choosing a file inserts a downloadable file block."
                  : "Choosing a file links the selected text (or display text) to that document and tracks usage."}
              </p>
              {!allowFileBlock && (
                <label>
                  <span className="meta">Display text</span>
                  <input
                    className="input"
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Text shown to readers"
                    value={text}
                  />
                </label>
              )}
              <label className="media-picker__search">
                <span className="sr-only">Search files</span>
                <input
                  className="input"
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search files"
                  type="search"
                  value={query}
                />
              </label>
              {loading ? (
                <p className="meta">Loading files…</p>
              ) : filteredDocuments.length === 0 ? (
                <p className="empty">No files in this knowledge base yet. Upload one below.</p>
              ) : (
                <div className="media-picker__grid">
                  {filteredDocuments.map((doc) => (
                    <button
                      className="media-picker__item"
                      key={doc.id}
                      onClick={() => chooseFile(doc)}
                      type="button"
                    >
                      <span aria-hidden="true" className="media-picker__thumb media-picker__thumb--file">
                        FILE
                      </span>
                      <span className="media-picker__title">{doc.title}</span>
                      <span className="media-picker__meta">File · {formatBytes(doc.fileSizeBytes)}</span>
                    </button>
                  ))}
                </div>
              )}
              <label className="button button--ghost" style={{ display: "inline-flex", marginTop: "0.75rem" }}>
                <input
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadDocument(file);
                    e.currentTarget.value = "";
                  }}
                  type="file"
                />
                {busy ? "Uploading…" : "Upload a file"}
              </label>
              <div className="link-dialog__actions" style={{ marginTop: "1rem" }}>
                {request.isEdit && request.anchor && (
                  <button className="button button--ghost" onClick={onRemove} type="button">
                    Remove link
                  </button>
                )}
                <button className="button button--ghost" onClick={onClose} type="button">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
