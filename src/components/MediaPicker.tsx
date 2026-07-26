"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SkeletonTile } from "@/components/route-states/RouteSkeleton";
import { formatBytes } from "@/lib/format";
import { useModalA11y } from "@/lib/use-modal-a11y";
import type { ContentBlock } from "@/lib/types";

interface LibraryAsset {
  id: string;
  title: string;
  slug: string;
  description: string;
  tags: string[];
  altText: string;
  assetType: "image" | "document";
  mimeType: string;
  fileSizeBytes: number;
  usageCount: number;
  url: string | null;
}

type Tab = "library" | "upload" | "video";
type AssetTypeFilter = "all" | "image" | "document";
type UsageFilter = "all" | "used" | "unused";

export type MediaPickerInsert =
  | { type: "block"; block: ContentBlock }
  | { type: "link"; assetId?: string; url: string; label: string };

function newBlockId() {
  return `block-${crypto.randomUUID()}`;
}

export function MediaPicker({
  hasTextSelection,
  kbId,
  kbSlug,
  onClose,
  onInsert,
}: {
  hasTextSelection: boolean;
  kbId: string;
  kbSlug: string;
  onClose: () => void;
  onInsert: (payload: MediaPickerInsert) => void;
}) {
  const [tab, setTab] = useState<Tab>("library");
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [query, setQuery] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (assetTypeFilter !== "all" && asset.assetType !== assetTypeFilter) {
        return false;
      }
      if (usageFilter === "used" && asset.usageCount === 0) {
        return false;
      }
      if (usageFilter === "unused" && asset.usageCount > 0) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [asset.title, asset.slug, asset.description, asset.tags.join(" ")].some((field) =>
        field.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [assetTypeFilter, assets, query, usageFilter]);

  function publicAssetUrl(asset: LibraryAsset) {
    return asset.url ?? `/kb/${kbSlug}/files/${asset.slug}`;
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/assets?kbId=${encodeURIComponent(kbId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Could not load the asset library.");
        if (active) {
          setAssets(
            (data.assets ?? []).map((asset: LibraryAsset) => ({
              ...asset,
              tags: Array.isArray(asset.tags) ? asset.tags : [],
              usageCount: Number.isFinite(asset.usageCount) ? asset.usageCount : 0,
            })),
          );
        }
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
        type: "block",
        block: {
          blockId: newBlockId(),
          type: "image",
          assetId: asset.id,
          url: publicAssetUrl(asset),
          alt: asset.altText || undefined,
          widthPercent: 100,
        },
      });
    } else {
      const url = publicAssetUrl(asset);
      if (hasTextSelection) {
        onInsert({ type: "link", assetId: asset.id, url, label: asset.title });
      } else {
        onInsert({
          type: "block",
          block: { blockId: newBlockId(), type: "asset_link", assetId: asset.id, label: asset.title },
        });
      }
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
          type: "block",
          block: {
            blockId: newBlockId(),
            type: "image",
            assetId: asset?.id,
            url: data.url ?? undefined,
            alt: asset?.altText || asset?.title || "",
            widthPercent: 100,
          },
        });
      } else {
        const label = asset?.title || file.name.replace(/\.[^.]+$/, "");
        if (hasTextSelection && data.url) {
          onInsert({ type: "link", assetId: asset?.id, url: data.url, label });
        } else {
          onInsert({ type: "block", block: { blockId: newBlockId(), type: "asset_link", assetId: asset?.id, label } });
        }
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
        type: "block",
        block: {
          blockId: newBlockId(),
          type: "video",
          assetId: data.asset?.id,
          provider: data.provider,
          embedId: data.embedId,
          url: data.provider === "direct" ? videoUrl.trim() : undefined,
          title: videoTitle.trim() || data.asset?.title || "Video",
        },
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
              <div className="media-picker__filters">
                <label className="media-picker__search">
                  <span className="sr-only">Search asset library</span>
                  <input
                    className="input"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search assets, tags, or descriptions"
                    type="search"
                    value={query}
                  />
                </label>
                <select
                  aria-label="Asset type"
                  className="input media-picker__select"
                  onChange={(event) => setAssetTypeFilter(event.target.value as AssetTypeFilter)}
                  value={assetTypeFilter}
                >
                  <option value="all">All types</option>
                  <option value="image">Images</option>
                  <option value="document">Files</option>
                </select>
                <select
                  aria-label="Asset usage"
                  className="input media-picker__select"
                  onChange={(event) => setUsageFilter(event.target.value as UsageFilter)}
                  value={usageFilter}
                >
                  <option value="all">All usage</option>
                  <option value="used">Used</option>
                  <option value="unused">Unused</option>
                </select>
              </div>
              {loading && (
                <div
                  aria-busy="true"
                  aria-label="Loading library"
                  className="media-picker__grid"
                  role="status"
                >
                  {Array.from({ length: 6 }, (_, index) => (
                    <SkeletonTile key={index} />
                  ))}
                </div>
              )}
              {!loading && assets.length === 0 && (
                <p className="empty">No images or files in this knowledge base yet. Use “Upload new”.</p>
              )}
              {!loading && assets.length > 0 && filteredAssets.length === 0 && (
                <p className="empty">No assets match the current search or filters.</p>
              )}
              <div className="media-picker__grid">
                {filteredAssets.map((asset) => (
                  <button
                    className="media-picker__item"
                    key={asset.id}
                    onClick={() => insertLibraryAsset(asset)}
                    type="button"
                  >
                    {asset.assetType === "image" && asset.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" className="media-picker__thumb" loading="lazy" src={asset.url} />
                    ) : (
                      <span className="media-picker__thumb media-picker__thumb--file" aria-hidden="true">
                        {asset.assetType === "image" ? "IMG" : "FILE"}
                      </span>
                    )}
                    <span className="media-picker__title">{asset.title}</span>
                    <span className="media-picker__meta">
                      {asset.assetType === "image" ? "Image" : "File"} · {formatBytes(asset.fileSizeBytes)}
                      {asset.usageCount > 0 ? ` · Used on ${asset.usageCount}` : " · Unused"}
                    </span>
                    {asset.tags.length > 0 && (
                      <span className="media-picker__tags">
                        {asset.tags.slice(0, 3).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </span>
                    )}
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
                  accept="image/png,image/jpeg,image/gif,image/webp"
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
