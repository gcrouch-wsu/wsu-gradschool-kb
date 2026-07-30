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
type UsageFilter = "all" | "used" | "unused";

export type MediaPickerInsert = { type: "block"; block: ContentBlock };

function newBlockId() {
  return `block-${crypto.randomUUID()}`;
}

export function MediaPicker({
  kbId,
  kbSlug,
  onClose,
  onInsert,
}: {
  hasTextSelection?: boolean;
  kbId: string;
  kbSlug: string;
  onClose: () => void;
  onInsert: (payload: MediaPickerInsert) => void;
}) {
  const [tab, setTab] = useState<Tab>("library");
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [query, setQuery] = useState("");
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
      if (asset.assetType !== "image") {
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
  }, [assets, query, usageFilter]);

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
    if (asset.assetType !== "image") {
      return;
    }
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
  }

  async function uploadImage(file: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kbId", kbId);
      const res = await fetch("/api/admin/assets/images", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Upload failed.");
      const asset = data.asset;
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
        aria-label="Insert image or video"
        aria-modal="true"
        className="media-picker"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong>Insert image or video</strong>
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
            Image library
          </button>
          <button
            aria-selected={tab === "upload"}
            className={`media-picker__tab ${tab === "upload" ? "is-active" : ""}`}
            onClick={() => setTab("upload")}
            role="tab"
            type="button"
          >
            Upload image
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
          <p className="meta">
            For web URLs or document files, use the Link button. This picker inserts images and videos only.
          </p>

          {tab === "library" && (
            <>
              <div className="media-picker__filters">
                <label className="media-picker__search">
                  <span className="sr-only">Search images</span>
                  <input
                    className="input"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search images, tags, or descriptions"
                    type="search"
                    value={query}
                  />
                </label>
                <select
                  aria-label="Usage filter"
                  className="input media-picker__select"
                  onChange={(event) => setUsageFilter(event.target.value as UsageFilter)}
                  value={usageFilter}
                >
                  <option value="all">All images</option>
                  <option value="used">Used</option>
                  <option value="unused">Unused</option>
                </select>
              </div>
              {loading ? (
                <div aria-busy="true" aria-label="Loading library" className="media-picker__grid" role="status">
                  {Array.from({ length: 6 }, (_, index) => (
                    <SkeletonTile key={index} />
                  ))}
                </div>
              ) : filteredAssets.length === 0 ? (
                <p className="empty">No images in this knowledge base yet. Use “Upload image”.</p>
              ) : (
                <div className="media-picker__grid">
                  {filteredAssets.map((asset) => (
                    <button
                      className="media-picker__item"
                      key={asset.id}
                      onClick={() => insertLibraryAsset(asset)}
                      type="button"
                    >
                      {asset.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" className="media-picker__thumb" loading="lazy" src={asset.url} />
                      ) : (
                        <span aria-hidden="true" className="media-picker__thumb media-picker__thumb--file">
                          IMG
                        </span>
                      )}
                      <span className="media-picker__title">{asset.title}</span>
                      <span className="media-picker__meta">
                        Image · {formatBytes(asset.fileSizeBytes)}
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
              )}
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
                    if (file) void uploadImage(file);
                    e.currentTarget.value = "";
                  }}
                  type="file"
                />
              </label>
            </div>
          )}
          {tab === "video" && (
            <div className="form">
              <label>
                <span className="meta">Video URL</span>
                <input
                  className="input"
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=… or Vimeo / direct MP4"
                  value={videoUrl}
                />
              </label>
              <label>
                <span className="meta">Title (optional)</span>
                <input
                  className="input"
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Accessible title for the video"
                  value={videoTitle}
                />
              </label>
              <button className="button" disabled={busy || !videoUrl.trim()} onClick={() => void embedVideo()} type="button">
                {busy ? "Adding…" : "Embed video"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
