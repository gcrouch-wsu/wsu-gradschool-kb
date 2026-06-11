"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useRef } from "react";
import {
  AdminAssetLibrary,
  type AdminAssetLibraryRow,
} from "@/components/AdminAssetLibrary";
import { AdminAssetUploadForm } from "@/components/AdminAssetUploadForm";
import { KbScopePicker, type KbScopeOption } from "@/components/KbScopePicker";
import { WorkspaceEmptyState } from "@/components/WorkspaceEmptyState";
import {
  buildAdminAssetsQuery,
  parseAdminAssetsTab,
  type AdminAssetsTab,
} from "@/lib/admin-assets-query";

interface AdminAssetsWorkspaceProps {
  assets: AdminAssetLibraryRow[];
  kbSlug: string;
  kbTitle: string;
  kbs: KbScopeOption[];
  statusFilter?: string;
}

const PAGE_TABS: AdminAssetsTab[] = ["knowledge-base", "upload"];

export function AdminAssetsWorkspace({
  assets,
  kbSlug,
  kbTitle,
  kbs,
  statusFilter,
}: AdminAssetsWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseAdminAssetsTab(searchParams.get("tab"));

  const tabLibraryId = useId();
  const tabUploadId = useId();
  const panelLibraryId = useId();
  const panelUploadId = useId();

  const libraryTabRef = useRef<HTMLButtonElement>(null);
  const uploadTabRef = useRef<HTMLButtonElement>(null);

  const replaceQuery = useCallback(
    (next: { kbSlug?: string; tab?: AdminAssetsTab; status?: string }) => {
      const params = buildAdminAssetsQuery({
        kbSlug: next.kbSlug ?? kbSlug,
        status: next.status ?? statusFilter,
        tab: next.tab ?? activeTab,
      });
      router.replace(`/admin/assets?${params}`, { scroll: false });
    },
    [activeTab, kbSlug, router, statusFilter],
  );

  const setTab = useCallback(
    (tab: AdminAssetsTab) => {
      replaceQuery({ tab });
    },
    [replaceQuery],
  );

  const selectKb = useCallback(
    (slug: string) => {
      replaceQuery({ kbSlug: slug, tab: activeTab });
    },
    [activeTab, replaceQuery],
  );

  const hrefForStatus = useCallback(
    (status?: string) => {
      return `/admin/assets?${buildAdminAssetsQuery({ kbSlug, status, tab: activeTab })}`;
    },
    [activeTab, kbSlug],
  );

  function focusTab(tab: AdminAssetsTab) {
    (tab === "knowledge-base" ? libraryTabRef : uploadTabRef).current?.focus();
  }

  function onTabListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = PAGE_TABS.indexOf(activeTab);
    let nextIndex = index;

    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % PAGE_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + PAGE_TABS.length) % PAGE_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = PAGE_TABS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = PAGE_TABS[nextIndex];
    setTab(nextTab);
    focusTab(nextTab);
  }

  return (
    <>
      <KbScopePicker kbs={kbs} onSelect={selectKb} selectedSlug={kbSlug} />

      <div
        aria-label="Asset library views"
        className="admin-tabs"
        onKeyDown={onTabListKeyDown}
        role="tablist"
      >
        <button
          ref={libraryTabRef}
          aria-controls={panelLibraryId}
          aria-selected={activeTab === "knowledge-base"}
          className={`tab-button${activeTab === "knowledge-base" ? " is-active" : ""}`}
          id={tabLibraryId}
          onClick={() => setTab("knowledge-base")}
          role="tab"
          tabIndex={activeTab === "knowledge-base" ? 0 : -1}
          type="button"
        >
          Knowledge base
        </button>
        <button
          ref={uploadTabRef}
          aria-controls={panelUploadId}
          aria-selected={activeTab === "upload"}
          className={`tab-button${activeTab === "upload" ? " is-active" : ""}`}
          id={tabUploadId}
          onClick={() => setTab("upload")}
          role="tab"
          tabIndex={activeTab === "upload" ? 0 : -1}
          type="button"
        >
          Upload
        </button>
      </div>

      <div
        aria-labelledby={tabLibraryId}
        hidden={activeTab !== "knowledge-base"}
        id={panelLibraryId}
        role="tabpanel"
        tabIndex={0}
      >
        {assets.length === 0 ? (
          <WorkspaceEmptyState
            action={{ label: "Upload an asset", onClick: () => setTab("upload") }}
            message="No assets in this knowledge base yet"
          />
        ) : (
          <AdminAssetLibrary
            assets={assets}
            hrefForStatus={hrefForStatus}
            kbTitle={kbTitle}
            statusFilter={statusFilter}
          />
        )}
      </div>

      <div
        aria-labelledby={tabUploadId}
        hidden={activeTab !== "upload"}
        id={panelUploadId}
        role="tabpanel"
        tabIndex={0}
      >
        <section className="card asset-upload-panel">
          <h2 className="admin-panel__title">Upload to {kbTitle}</h2>
          <p className="meta">PDF, Word (.docx/.doc), or plain text — up to 25 MB. You can also link a video.</p>
          <AdminAssetUploadForm
            kbs={kbs.map((kb) => ({ id: kb.id, title: kb.title }))}
            lockKbId={kbs.find((kb) => kb.slug === kbSlug)?.id}
          />
        </section>
      </div>
    </>
  );
}
