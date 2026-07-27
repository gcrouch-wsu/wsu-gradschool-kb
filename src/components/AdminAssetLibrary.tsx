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
  description: string;
  tags: string[];
  assetType: "document" | "image" | "video";
  status: AssetStatus;
  fileSizeBytes: number;
  formattedSize: string;
  formattedDate: string;
  usageCount: number;
  usagePages: string[];
  publicUrl?: string;
};

type TypeFilter = "all" | "document" | "image" | "video";
type UsageFilter = "all" | "used" | "unused";
type SortKey = "title" | "updated" | "size" | "type" | "usage";

function assetSearchFilter(asset: AdminAssetLibraryRow, query: string) {
  return [
    asset.title,
    asset.slug,
    asset.description,
    asset.tags.join(" "),
    asset.usagePages.join(" "),
  ].some((field) => field.toLowerCase().includes(query));
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
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("title");

  const documentCount = assets.filter((asset) => asset.assetType === "document").length;
  const imageCount = assets.filter((asset) => asset.assetType === "image").length;
  const videoCount = assets.filter((asset) => asset.assetType === "video").length;
  const usedCount = assets.filter((asset) => asset.usageCount > 0).length;
  const unusedCount = assets.length - usedCount;

  const tableRows = useMemo(() => {
    let rows = assets;
    if (statusFilter === "active" || statusFilter === "archived") {
      rows = rows.filter((asset) => asset.status === statusFilter);
    }
    if (typeFilter !== "all") {
      rows = rows.filter((asset) => asset.assetType === typeFilter);
    }
    if (usageFilter === "used") {
      rows = rows.filter((asset) => asset.usageCount > 0);
    } else if (usageFilter === "unused") {
      rows = rows.filter((asset) => asset.usageCount === 0);
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
      if (sortKey === "usage") {
        return b.usageCount - a.usageCount || a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
    return sorted;
  }, [assets, sortKey, statusFilter, typeFilter, usageFilter]);

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
                {asset.description && <span className="asset-library__description meta">{asset.description}</span>}
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
            id: "tags",
            header: "Tags",
            cell: (asset) =>
              asset.tags.length > 0 ? (
                <span className="asset-library__tag-list">
                  {asset.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </span>
              ) : (
                <span className="meta">None</span>
              ),
          },
          {
            id: "usage",
            header: "Usage",
            cell: (asset) =>
              asset.usageCount > 0 ? (
                <span className="asset-library__usage">
                  <strong>{asset.usageCount}</strong>
                  <span className="meta">
                    {asset.usagePages.length > 0 ? asset.usagePages.join(", ") : "Referenced in pages"}
                  </span>
                </span>
              ) : (
                <span className="asset-library__unused">Unused</span>
              ),
          },
          {
            id: "slug",
            header: "Slug",
            cell: (asset) => <span className="asset-library__slug">{asset.slug}</span>,
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
        searchPlaceholder="Search assets, tags, or usage…"
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
              label="Usage"
              onChange={(nextValue) => setUsageFilter(nextValue as UsageFilter)}
              options={[
                { label: `All (${assets.length})`, value: "all" },
                { label: `Used (${usedCount})`, value: "used" },
                { label: `Unused (${unusedCount})`, value: "unused" },
              ]}
              searchable={false}
              value={usageFilter}
            />
            <DropdownSelect
              className="asset-library__sort"
              label="Sort"
              onChange={(nextValue) => setSortKey(nextValue as SortKey)}
              options={[
                { label: "Title", value: "title" },
                { label: "Last updated", value: "updated" },
                { label: "File size", value: "size" },
                { label: "Type", value: "type" },
                { label: "Usage", value: "usage" },
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
