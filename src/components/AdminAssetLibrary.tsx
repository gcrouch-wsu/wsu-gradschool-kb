"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
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

function assetSearchFilter(asset: AdminAssetLibraryRow, query: string) {
  return asset.title.toLowerCase().includes(query) || asset.slug.toLowerCase().includes(query);
}

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
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("title");

  const documentCount = assets.filter((asset) => asset.assetType === "document").length;
  const imageCount = assets.filter((asset) => asset.assetType === "image").length;
  const videoCount = assets.filter((asset) => asset.assetType === "video").length;

  const tableRows = useMemo(() => {
    let rows = assets;
    if (statusFilter === "active" || statusFilter === "archived") {
      rows = rows.filter((asset) => asset.status === statusFilter);
    }
    if (typeFilter !== "all") {
      rows = rows.filter((asset) => asset.assetType === typeFilter);
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
  }, [assets, sortKey, statusFilter, typeFilter]);

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

      <AdminDataTable
        columns={[
          {
            id: "title",
            header: "Title",
            cell: (asset) => (
              <>
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
              </>
            ),
          },
          {
            id: "type",
            header: "Type",
            cell: (asset) => (
              <span className={`asset-library__badge asset-library__badge--${asset.assetType}`}>
                {asset.assetType}
              </span>
            ),
          },
          {
            id: "slug",
            header: "Slug",
            cell: (asset) => <span className="asset-library__slug">{asset.slug}</span>,
          },
          {
            id: "size",
            header: "Size",
            cell: (asset) => asset.formattedSize,
          },
          {
            id: "updated",
            header: "Updated",
            cell: (asset) => asset.formattedDate,
          },
          {
            id: "status",
            header: "Status",
            cell: (asset) => (
              <span
                className={
                  asset.status === "archived"
                    ? "asset-library__status-pill asset-library__status-pill--archived"
                    : "asset-library__status-pill"
                }
              >
                {asset.status}
              </span>
            ),
          },
        ]}
        emptyMessage="No assets match your search or filters."
        getRowId={(asset) => asset.id}
        rows={tableRows}
        searchFilter={assetSearchFilter}
        searchPlaceholder="Search by title or slug…"
        toolbarExtra={
          <>
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
          </>
        }
      />
    </section>
  );
}
