"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { DropdownSelect } from "@/components/DropdownSelect";
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
  hrefForStatus,
}: {
  assets: AdminAssetLibraryRow[];
  kbTitle: string;
  statusFilter?: string;
  hrefForStatus: (status?: string) => string;
}) {
  const searchFieldId = useId();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("title");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let rows = assets;
    if (statusFilter === "active" || statusFilter === "archived") {
      rows = rows.filter((asset) => asset.status === statusFilter);
    }
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
  }, [assets, query, sortKey, statusFilter, typeFilter]);

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
            href={hrefForStatus()}
          >
            All
          </Link>
          <Link
            className={
              statusFilter === "active" ? "asset-library__status-link is-active" : "asset-library__status-link"
            }
            href={hrefForStatus("active")}
          >
            Active
          </Link>
          <Link
            className={
              statusFilter === "archived" ? "asset-library__status-link is-active" : "asset-library__status-link"
            }
            href={hrefForStatus("archived")}
          >
            Archived
          </Link>
        </div>
      </div>

      <div className="asset-library__controls">
        <label className="asset-library__search" htmlFor={searchFieldId}>
          <span className="sr-only">Search assets</span>
          <input
            className="input"
            id={searchFieldId}
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
              aria-selected={typeFilter === value}
              className={typeFilter === value ? "asset-library__tab is-active" : "asset-library__tab"}
              key={value}
              onClick={() => setTypeFilter(value)}
              role="tab"
              type="button"
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <DropdownSelect
          className="asset-library__sort"
          label="Sort"
          onChange={(nextValue) => setSortKey(nextValue as SortKey)}
          options={[
            { label: "Title", value: "title" },
            { label: "Last updated", value: "updated" },
            { label: "File size", value: "size" },
            { label: "Type", value: "type" },
          ]}
          searchable={false}
          value={sortKey}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="meta asset-library__empty">No assets match your search or filters.</p>
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
