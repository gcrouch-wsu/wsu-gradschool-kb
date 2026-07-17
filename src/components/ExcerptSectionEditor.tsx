"use client";

import { useEffect, useState } from "react";
import type { ContentBlock, PageStatus, PageVisibility } from "@/lib/types";

type ExcerptBlock = Extract<ContentBlock, { type: "excerpt" }>;

interface SourceKbOption {
  id: string;
  title: string;
}

interface SourcePageOption {
  id: string;
  title: string;
  path: string[];
  status: PageStatus;
  visibility: PageVisibility;
}

interface SourceHeadingOption {
  blockId: string;
  text: string;
  level: 2 | 3;
}

export function ExcerptSectionEditor({
  block,
  onChange,
}: {
  block: ExcerptBlock;
  onChange: (block: ExcerptBlock) => void;
}) {
  const [kbs, setKbs] = useState<SourceKbOption[]>([]);
  const [selectedKbId, setSelectedKbId] = useState("");
  const [pages, setPages] = useState<SourcePageOption[]>([]);
  const [headings, setHeadings] = useState<SourceHeadingOption[]>([]);
  const [sourcePageTitle, setSourcePageTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/excerpt-sources")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("load failed"))))
      .then((data: { kbs?: SourceKbOption[] }) => {
        if (!cancelled) setKbs(data.kbs ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load knowledge bases for the excerpt picker.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!block.sourcePageId) {
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/excerpt-sources?page=${encodeURIComponent(block.sourcePageId)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("load failed"))))
      .then((data: { page?: { id: string; title: string }; headings?: SourceHeadingOption[] }) => {
        if (cancelled) return;
        setSourcePageTitle(data.page?.title ?? "");
        setHeadings(data.headings ?? []);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("The source page could not be loaded. It may have been removed.");
      });
    return () => {
      cancelled = true;
    };
  }, [block.sourcePageId]);

  useEffect(() => {
    if (!selectedKbId) {
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/excerpt-sources?kb=${encodeURIComponent(selectedKbId)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("load failed"))))
      .then((data: { pages?: SourcePageOption[] }) => {
        if (!cancelled) setPages(data.pages ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load pages for that knowledge base.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKbId]);

  return (
    <div className="excerpt-editor form">
      <p className="meta">
        Include a live excerpt from another page. The published page always shows the source&apos;s
        current content inside a styled box with a link back to the source
        {sourcePageTitle ? (
          <>
            {" "}
            — currently <strong>{sourcePageTitle}</strong>
            {block.sourceHeadingBlockId
              ? (() => {
                  const heading = headings.find((h) => h.blockId === block.sourceHeadingBlockId);
                  return heading ? (
                    <>
                      {" › "}
                      <strong>{heading.text}</strong>
                    </>
                  ) : (
                    <> › a section that no longer exists on the source page</>
                  );
                })()
              : " (whole page)"}
            .
          </>
        ) : (
          ". Choose a source page below."
        )}
      </p>
      {error && <p className="alert editor-format-hint">{error}</p>}
      <div className="field-row">
        <label>
          <span className="meta">Knowledge base</span>
          <select
            className="input"
            onChange={(e) => setSelectedKbId(e.target.value)}
            value={selectedKbId}
          >
            <option value="">Select…</option>
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="meta">Source page</span>
          <select
            className="input"
            disabled={!selectedKbId}
            onChange={(e) => {
              if (e.target.value) {
                onChange({ ...block, sourcePageId: e.target.value, sourceHeadingBlockId: undefined });
              }
            }}
            value={pages.some((page) => page.id === block.sourcePageId) ? block.sourcePageId : ""}
          >
            <option value="">Select…</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title}
                {page.status !== "published" ? ` (${page.status})` : ""}
                {page.visibility === "staff" ? " (staff only)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="meta">Section</span>
          <select
            className="input"
            disabled={!block.sourcePageId}
            onChange={(e) =>
              onChange({ ...block, sourceHeadingBlockId: e.target.value || undefined })
            }
            value={block.sourceHeadingBlockId ?? ""}
          >
            <option value="">Whole page</option>
            {headings.map((heading) => (
              <option key={heading.blockId} value={heading.blockId}>
                {heading.level === 3 ? "  " : ""}
                {heading.text}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label>
          <span className="meta">Attribution label (optional)</span>
          <input
            className="input"
            onChange={(e) => onChange({ ...block, label: e.target.value || undefined })}
            placeholder="Default: KB: Page — Section"
            value={block.label ?? ""}
          />
        </label>
        <label className="excerpt-editor__checkbox">
          <input
            checked={Boolean(block.openInNewTab)}
            onChange={(e) => onChange({ ...block, openInNewTab: e.target.checked || undefined })}
            type="checkbox"
          />
          <span className="meta">Open the source link in a new tab</span>
        </label>
      </div>
      <p className="meta">
        The attribution label is what readers see after &quot;Included from:&quot; — leave it blank
        to show the knowledge base, page, and section names. Headings inside the excerpt are shown
        as bold text so this page&apos;s own outline stays accurate. Readers who cannot view the
        source page see an &quot;unavailable&quot; notice instead of the content.
      </p>
    </div>
  );
}
