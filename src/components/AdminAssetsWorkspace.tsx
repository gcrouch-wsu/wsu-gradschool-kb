"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useRef } from "react";
import {
  AdminAssetLibrary,
  type AdminAssetLibraryRow,
} from "@/components/AdminAssetLibrary";
import { AdminAssetUploadForm } from "@/components/AdminAssetUploadForm";

type PageTab = "library" | "upload";

interface AdminAssetsWorkspaceProps {
  assets: AdminAssetLibraryRow[];
  kbId: string;
  kbTitle: string;
  kbs: { id: string; title: string }[];
  statusFilter?: string;
}

const PAGE_TABS: PageTab[] = ["library", "upload"];

export function AdminAssetsWorkspace({
  assets,
  kbId,
  kbTitle,
  kbs,
  statusFilter,
}: AdminAssetsWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab: PageTab = searchParams.get("tab") === "upload" ? "upload" : "library";

  const tabLibraryId = useId();
  const tabUploadId = useId();
  const panelLibraryId = useId();
  const panelUploadId = useId();

  const libraryTabRef = useRef<HTMLButtonElement>(null);
  const uploadTabRef = useRef<HTMLButtonElement>(null);

  const setTab = useCallback(
    (tab: PageTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "upload") {
        params.set("tab", "upload");
      } else {
        params.delete("tab");
      }
      router.replace(`/admin/assets?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const hrefForStatus = useCallback(
    (status?: string) => {
      const params = new URLSearchParams({ kb: kbId });
      if (status) {
        params.set("status", status);
      }
      if (activeTab === "upload") {
        params.set("tab", "upload");
      }
      return `/admin/assets?${params.toString()}`;
    },
    [activeTab, kbId],
  );

  function focusTab(tab: PageTab) {
    (tab === "library" ? libraryTabRef : uploadTabRef).current?.focus();
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
      <div
        aria-label="Asset library views"
        className="admin-tabs"
        onKeyDown={onTabListKeyDown}
        role="tablist"
      >
        <button
          ref={libraryTabRef}
          aria-controls={panelLibraryId}
          aria-selected={activeTab === "library"}
          className={`tab-button${activeTab === "library" ? " is-active" : ""}`}
          id={tabLibraryId}
          onClick={() => setTab("library")}
          role="tab"
          tabIndex={activeTab === "library" ? 0 : -1}
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
        hidden={activeTab !== "library"}
        id={panelLibraryId}
        role="tabpanel"
        tabIndex={0}
      >
        <AdminAssetLibrary
          assets={assets}
          hrefForStatus={hrefForStatus}
          kbTitle={kbTitle}
          statusFilter={statusFilter}
        />
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
          <AdminAssetUploadForm kbs={kbs} lockKbId={kbId} />
        </section>
      </div>
    </>
  );
}
