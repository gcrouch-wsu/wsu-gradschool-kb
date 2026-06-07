"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AssetStatus } from "@/lib/types";

export type AdminAssetLibraryRow = {
  id: string;
  title: string;
  slug: string;
  assetType: "document" | "image" | "video";
  status: AssetStatus;
  fileSizeBytes: number;
  formattedSize: string;
  formattedDate: string;
  publicUrl?: string;
};

type TypeFilter = "all" | "document" | "image" | "video";
type SortKey = "title" | "updated" | "size" | "type";

export function AdminAssetLibrary({
  assets,
  kbTitle,
  statusFilter,
  kbId,
}: {
  assets: AdminAssetLibraryRow[];
  kbTitle: string;
  kbId: string;
  statusFilter?: string;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("title");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let rows = assets;
    if (typeFilter !== "all") {
      rows = rows.filter((asset) => asset.assetType === typeFilter);
    }
    if (normalizedQuery) {
      rows = rows.filter(
        (asset) =>
          asset.title.toLowerCase().includes(normalizedQuery) ||
          asset.slug.toLowerCase().includes(normalizedQuery),
      );
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sortKey === "updated") {
        return b.formattedDate.localeCompare(a.formattedDate);
      }
      if (sortKey === "size") {
        return b.fileSizeBytes - a.fileSizeBytes;
      }
      if (sortKey === "type") {
        return a.assetType.localeCompare(b.assetType) || a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
    return sorted;
  }, [assets, query, sortKey, typeFilter]);

  const documentCount = assets.filter((asset) => asset.assetType === "document").length;
  const imageCount = assets.filter((asset) => asset.assetType === "image").length;
  const videoCount = assets.filter((asset) => asset.assetType === "video").length;

  return (
    <section className="asset-library">
      <div className="asset-library__header">
        <div>
          <h2>{kbTitle}</h2>
          <p className="meta">
            {assets.length} asset{assets.length === 1 ? "" : "s"}
            {documentCount > 0 || imageCount > 0 || videoCount > 0
              ? ` · ${documentCount} doc · ${imageCount} img · ${videoCount} video`
              : ""}
          </p>
        </div>
        <div className="asset-library__status">
          <Link
            className={!statusFilter ? "asset-library__status-link is-active" : "asset-library__status-link"}
            href={`/admin/assets?kb=${kbId}`}
          >
            All
          </Link>
          <Link
            className={
              statusFilter === "active" ? "asset-library__status-link is-active" : "asset-library__status-link"
            }
            href={`/admin/assets?kb=${kbId}&status=active`}
          >
            Active
          </Link>
          <Link
            className={
              statusFilter === "archived" ? "asset-library__status-link is-active" : "asset-library__status-link"
            }
            href={`/admin/assets?kb=${kbId}&status=archived`}
          >
            Archived
          </Link>
        </div>
      </div>

      <div className="asset-library__controls">
        <label className="asset-library__search">
          <span className="sr-only">Search assets</span>
          <input
            className="input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or slug…"
            type="search"
            value={query}
          />
        </label>
        <div className="asset-library__type-tabs" role="tablist" aria-label="Asset type">
          {(
            [
              ["all", "All", assets.length],
              ["document", "Docs", documentCount],
              ["image", "Images", imageCount],
              ["video", "Videos", videoCount],
            ] as const
          ).map(([value, label, count]) => (
            <button
              className={typeFilter === value ? "asset-library__tab is-active" : "asset-library__tab"}
              key={value}
              onClick={() => setTypeFilter(value)}
              type="button"
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <label className="asset-library__sort">
          <span className="meta">Sort</span>
          <select className="input" onChange={(event) => setSortKey(event.target.value as SortKey)} value={sortKey}>
            <option value="title">Title</option>
            <option value="updated">Last updated</option>
            <option value="size">File size</option>
            <option value="type">Type</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="meta asset-library__empty">
          {assets.length === 0
            ? "No assets in this knowledge base yet. Upload a document below."
            : "No assets match your search or filters."}
        </p>
      ) : (
        <div className="asset-library__table-wrap">
          <table className="asset-library__table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Type</th>
                <th scope="col">Slug</th>
                <th scope="col">Size</th>
                <th scope="col">Updated</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <Link className="asset-library__title-link" href={`/admin/assets/${asset.id}`}>
                      {asset.title}
                    </Link>
                    {asset.publicUrl && (
                      <a
                        className="asset-library__public-link meta"
                        href={asset.publicUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Public URL
                      </a>
                    )}
                  </td>
                  <td>
                    <span className={`asset-library__badge asset-library__badge--${asset.assetType}`}>
                      {asset.assetType}
                    </span>
                  </td>
                  <td className="asset-library__slug">{asset.slug}</td>
                  <td>{asset.formattedSize}</td>
                  <td>{asset.formattedDate}</td>
                  <td>
                    <span
                      className={
                        asset.status === "archived"
                          ? "asset-library__status-pill asset-library__status-pill--archived"
                          : "asset-library__status-pill"
                      }
                    >
                      {asset.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="meta asset-library__footer">
        Showing {filtered.length} of {assets.length}
      </p>
    </section>
  );
}
