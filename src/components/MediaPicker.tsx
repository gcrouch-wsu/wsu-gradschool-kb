"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatBytes } from "@/lib/format";
import { useModalA11y } from "@/lib/use-modal-a11y";
import type { ContentBlock } from "@/lib/types";

interface LibraryAsset {
  id: string;
  title: string;
  slug: string;
  description: string;
  altText: string;
  assetType: "image" | "document";
  mimeType: string;
  fileSizeBytes: number;
  url: string | null;
}

type Tab = "library" | "upload" | "video";

function newBlockId() {
  return `block-${crypto.randomUUID()}`;
}

export function MediaPicker({
  kbId,
  onClose,
  onInsert,
}: {
  kbId: string;
  onClose: () => void;
  onInsert: (block: ContentBlock) => void;
}) {
  const [tab, setTab] = useState<Tab>("library");
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/assets?kbId=${encodeURIComponent(kbId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Could not load the asset library.");
        if (active) setAssets(data.assets ?? []);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load the asset library.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [kbId]);

  function insertLibraryAsset(asset: LibraryAsset) {
    if (asset.assetType === "image") {
      onInsert({
        blockId: newBlockId(),
        type: "image",
        assetId: asset.id,
        url: asset.url ?? undefined,
        alt: asset.altText || undefined,
        widthPercent: 100,
      });
    } else {
      onInsert({ blockId: newBlockId(), type: "asset_link", assetId: asset.id, label: asset.title });
    }
  }

  async function uploadFile(kind: "image" | "document", file: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kbId", kbId);
      const endpoint = kind === "image" ? "/api/admin/assets/images" : "/api/admin/assets/documents";
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed.");
      const asset = data.asset;
      if (kind === "image") {
        onInsert({
          blockId: newBlockId(),
          type: "image",
          assetId: asset?.id,
          url: data.url ?? undefined,
          alt: asset?.title ?? "",
          widthPercent: 100,
        });
      } else {
        onInsert({ blockId: newBlockId(), type: "asset_link", assetId: asset?.id, label: asset?.title });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function embedVideo() {
    if (!videoUrl.trim()) {
      setError("Enter a video URL.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/assets/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId, url: videoUrl.trim(), title: videoTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Could not add the video.");
      onInsert({
        blockId: newBlockId(),
        type: "video",
        assetId: data.asset?.id,
        provider: data.provider,
        embedId: data.embedId,
        url: data.provider === "direct" ? videoUrl.trim() : undefined,
        title: videoTitle.trim() || data.asset?.title || "Video",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the video.");
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
        aria-label="Insert media"
        aria-modal="true"
        className="media-picker"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong>Insert media</strong>
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="media-picker__tabs" role="tablist">
          <button
            aria-selected={tab === "library"}
            className={`media-picker__tab ${tab === "library" ? "is-active" : ""}`}
            onClick={() => setTab("library")}
            role="tab"
            type="button"
          >
            Asset library
          </button>
          <button
            aria-selected={tab === "upload"}
            className={`media-picker__tab ${tab === "upload" ? "is-active" : ""}`}
            onClick={() => setTab("upload")}
            role="tab"
            type="button"
          >
            Upload new
          </button>
          <button
            aria-selected={tab === "video"}
            className={`media-picker__tab ${tab === "video" ? "is-active" : ""}`}
            onClick={() => setTab("video")}
            role="tab"
            type="button"
          >
            Embed video
          </button>
        </div>

        <div className="media-picker__body">
          {error && <p className="alert alert--error">{error}</p>}

          {tab === "library" && (
            <>
              {loading && <p className="meta">Loading library…</p>}
              {!loading && assets.length === 0 && (
                <p className="empty">No images or files in this knowledge base yet. Use “Upload new”.</p>
              )}
              <div className="media-picker__grid">
                {assets.map((asset) => (
                  <button
                    className="media-picker__item"
                    key={asset.id}
                    onClick={() => insertLibraryAsset(asset)}
                    type="button"
                  >
                    {asset.assetType === "image" && asset.url ? (

                      <img alt="" className="media-picker__thumb" loading="lazy" src={asset.url} />
                    ) : (
                      <span className="media-picker__thumb media-picker__thumb--file" aria-hidden="true">
                        {asset.assetType === "image" ? "IMG" : "FILE"}
                      </span>
                    )}
                    <span className="media-picker__title">{asset.title}</span>
                    <span className="media-picker__meta">
                      {asset.assetType === "image" ? "Image" : "File"} · {formatBytes(asset.fileSizeBytes)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "upload" && (
            <div className="media-picker__upload">
              <label className="button button--ghost">
                {busy ? "Uploading…" : "Choose an image"}
                <input
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  disabled={busy}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile("image", file);
                  }}
                  type="file"
                />
              </label>
              <label className="button button--ghost">
                {busy ? "Uploading…" : "Choose a file (PDF, Word, text)"}
                <input
                  accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  disabled={busy}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile("document", file);
                  }}
                  type="file"
                />
              </label>
              <p className="meta">Uploaded files are added to the asset library and inserted here.</p>
            </div>
          )}

          {tab === "video" && (
            <div className="media-picker__video form">
              <label>
                <span className="meta">Video URL (YouTube, Vimeo, or direct link)</span>
                <input
                  className="input"
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={videoUrl}
                />
              </label>
              <label>
                <span className="meta">Title (for accessibility)</span>
                <input
                  className="input"
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="e.g. How to submit a fact sheet"
                  value={videoTitle}
                />
              </label>
              <button className="button" disabled={busy} onClick={embedVideo} type="button">
                {busy ? "Adding…" : "Insert video"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
