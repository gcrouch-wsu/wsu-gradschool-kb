"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DraftPreviewModal } from "@/components/DraftPreviewModal";
import { DropdownSelect } from "@/components/DropdownSelect";
import { GuidedTour } from "@/components/GuidedTour";
import { PageDocumentEditor } from "@/components/PageDocumentEditor";
import { PageHistoryPanel } from "@/components/PageHistoryPanel";
import { RelocatePageDialog } from "@/components/RelocatePageDialog";
import { RelatedPagesEditor } from "@/components/RelatedPagesEditor";
import { AiPageReviewPanel } from "@/components/AiPageReviewPanel";
import { StatusModal } from "@/components/StatusModal";
import { markHeadingOrderProblems, markMissingAltImages, markProblemLinks } from "@/lib/page-editor-format";
import { formatTimestamp } from "@/lib/format";
import { DEFAULT_THEME, themeToEditorPalette } from "@/lib/kb-theme";
import { normalizePageTags } from "@/lib/page-tags";
import { assessPageReadyForSummaryDraft } from "@/lib/summary-draft-core";
import type { PageReviewSuggestion } from "@/lib/page-review-core";
import type { ContentBlock, KbPage, KnowledgeBase, PageRevisionSnapshot, PageStatus, PageVisibility } from "@/lib/types";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const VAGUE_LINK_TEXT = new Set(["click here", "here", "more", "read more", "link", "this"]);

const visibilityOptions = [
  { label: "Public", value: "public" },
  { label: "Staff only", value: "staff" },
];

const tocDepthOptions = [
  { label: "H2 only", value: "2" },
  { label: "H2 + H3", value: "3" },
];

interface ParentOption {
  path: string;
  title: string;
  depth: number;
  status: PageStatus;
}

type EditableStatus = "draft" | "published" | "proposed";

interface OverflowMenuItem {
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  label: string;
  onSelect: () => void;
}

function ActionOverflowMenu({
  disabled,
  items,
}: {
  disabled: boolean;
  items: OverflowMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actionableItems = items.filter((item) => !item.divider);
  const clampedActiveIndex = Math.min(activeIndex, Math.max(actionableItems.length - 1, 0));

  function updateMenuPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 152;
    setMenuPosition({
      left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
      top: rect.bottom + 6,
    });
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectItem(index: number) {
    const item = actionableItems[index];
    if (!item || item.disabled) return;
    item.onSelect();
    closeMenu();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      updateMenuPosition();
      setOpen(true);
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (actionableItems.length === 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((clampedActiveIndex + 1) % actionableItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((clampedActiveIndex - 1 + actionableItems.length) % actionableItems.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(actionableItems.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectItem(clampedActiveIndex);
    }
  }

  return (
    <div className="tree-editor__menu-anchor" ref={rootRef}>
      <button
        ref={triggerRef}
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More actions"
        className="icon-button"
        disabled={disabled}
        onClick={() => {
          if (!open) updateMenuPosition();
          setOpen((value) => !value);
        }}
        onKeyDown={onTriggerKeyDown}
        type="button"
      >
        ⋯
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <ul
          aria-label="More page actions"
          className="kb-picker__menu tree-editor__menu tree-editor__menu--portal"
          id={menuId}
          onKeyDown={onMenuKeyDown}
          ref={menuRef}
          role="menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
        >
          {items.map((item, index) => {
            if (item.divider) {
              return <li key={`divider-${index}`} className="tree-editor__menu-divider" role="separator" />;
            }
            const currentIndex = actionableItems.indexOf(item);
            return (
              <li key={`${item.label}-${index}`} role="none">
                <button
                  className={`kb-picker__option tree-editor__menu-item${
                    currentIndex === clampedActiveIndex ? " is-active" : ""
                  }${item.danger ? " tree-editor__menu-item--danger" : ""}`}
                  disabled={item.disabled}
                  onClick={() => selectItem(currentIndex)}
                  onMouseEnter={() => setActiveIndex(currentIndex)}
                  role="menuitem"
                  type="button"
                >
                  <span className="kb-picker__option-title">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}

function collectInlineHtml(blocks: ContentBlock[]): string[] {
  const html: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "heading" || block.type === "alert") {
      if (block.html) html.push(block.html);
    } else if (block.type === "list") {
      html.push(...(block.itemHtml ?? []));
    } else if (block.type === "table") {
      html.push(...(block.rowsHtml ?? []).flat());
    } else if (block.type === "card") {
      html.push(...collectInlineHtml(block.blocks));
    } else if (block.type === "procedure_section") {
      html.push(...collectInlineHtml(block.blocks));
    }
  }
  return html;
}

function textFromHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function hasBadLinks(blocks: ContentBlock[]) {
  let vague = false;
  let empty = false;
  for (const html of collectInlineHtml(blocks)) {
    const links = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi);
    for (const link of links) {
      const attrs = link[1] ?? "";
      const href = attrs.match(/\bhref=["']([^"']*)["']/i)?.[1]?.trim() ?? "";
      const label = textFromHtml(link[2] ?? "").toLowerCase();
      if (!href || href === "#") empty = true;
      if (!label || VAGUE_LINK_TEXT.has(label)) vague = true;
    }
  }
  return { vague, empty };
}

interface BlockIssueCounts {
  imagesMissingAlt: number;
  tablesMissingHeaders: number;
  h3BeforeH2: boolean;
  hasH2: boolean;
}

function countBlockIssues(blocks: ContentBlock[]): BlockIssueCounts {
  let imagesMissingAlt = 0;
  let tablesMissingHeaders = 0;
  let h3BeforeH2 = false;
  let seenH2 = false;

  for (const block of blocks) {
    if (block.type === "heading") {
      if (block.level === 2) seenH2 = true;
      if (block.level === 3 && !seenH2) h3BeforeH2 = true;
    } else if (block.type === "procedure_section") {
      if (block.level === 2) seenH2 = true;
      if (block.level === 3 && !seenH2) h3BeforeH2 = true;
      const nested = countBlockIssues(block.blocks);
      imagesMissingAlt += nested.imagesMissingAlt;
      tablesMissingHeaders += nested.tablesMissingHeaders;
      h3BeforeH2 ||= nested.h3BeforeH2 && !seenH2;
      seenH2 ||= nested.hasH2;
    } else if (block.type === "image") {
      if ((block.assetId || block.url) && !block.decorative && !(block.alt ?? "").trim()) {
        imagesMissingAlt += 1;
      }
    } else if (block.type === "table") {
      if (!block.hasHeaderRow && !block.hasHeaderColumn) {
        tablesMissingHeaders += 1;
      }
    } else if (block.type === "card") {
      const nested = countBlockIssues(block.blocks);
      imagesMissingAlt += nested.imagesMissingAlt;
      tablesMissingHeaders += nested.tablesMissingHeaders;
      h3BeforeH2 ||= nested.h3BeforeH2 && !seenH2;
      seenH2 ||= nested.hasH2;
    }
  }

  return { imagesMissingAlt, tablesMissingHeaders, h3BeforeH2, hasH2: seenH2 };
}

export function AdminPageEditorForm({
  kb,
  page,
  parentOptions,
  relatedPageOptions,
  destinationKbs,
  canApproveProposed = false,
}: {
  kb: KnowledgeBase;
  page: KbPage;
  parentOptions: ParentOption[];
  relatedPageOptions: Array<{ id: string; title: string; path: string }>;
  destinationKbs: Array<Pick<KnowledgeBase, "id" | "title" | "slug" | "visibility">>;
  canApproveProposed?: boolean;
}) {
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [summary, setSummary] = useState(page.summary);
  const [tagsText, setTagsText] = useState(normalizePageTags(page.tags).join(", "));
  const [visibility, setVisibility] = useState<PageVisibility>(page.visibility);
  const [parentPath, setParentPath] = useState(page.path.slice(0, -1).join("/"));
  const [ownerLabel, setOwnerLabel] = useState(page.ownerLabel);
  const [contactEmail, setContactEmail] = useState(page.contactEmail);
  const [lastReviewedDate, setLastReviewedDate] = useState(page.lastReviewedDate);
  const [relatedPageIds, setRelatedPageIds] = useState<string[]>(page.relatedPageIds ?? []);
  const [nextStepsHeading, setNextStepsHeading] = useState(page.nextStepsHeading ?? "");
  const [nextStepsIntro, setNextStepsIntro] = useState(page.nextStepsIntro ?? "");
  const [showToc, setShowToc] = useState(page.showToc);
  const [tocDepth, setTocDepth] = useState(page.tocDepth);
  const [showSummary, setShowSummary] = useState(page.showSummary !== false);
  const [showPrintButton, setShowPrintButton] = useState(page.showPrintButton !== false);
  const [blocks, setBlocks] = useState<ContentBlock[]>(page.blocks);
  const [relocateOpen, setRelocateOpen] = useState(false);
  const [nextReviewDate, setNextReviewDate] = useState(page.nextReviewDate);
  const [reviewAssigneeEmail, setReviewAssigneeEmail] = useState(page.reviewAssigneeEmail ?? "");
  const [reviewSlaDays, setReviewSlaDays] = useState(
    page.reviewSlaDays != null ? String(page.reviewSlaDays) : "",
  );
  const [publishAt, setPublishAt] = useState(page.publishAt ?? "");
  const [verifiedAt, setVerifiedAt] = useState(page.verifiedAt);
  const [verifiedBy, setVerifiedBy] = useState(page.verifiedBy);
  const [busy, setBusy] = useState<EditableStatus | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [summaryDraftBusy, setSummaryDraftBusy] = useState(false);
  const [summaryDraftHint, setSummaryDraftHint] = useState<string | null>(null);
  const [pageReviewBusy, setPageReviewBusy] = useState(false);
  const [pageReviewError, setPageReviewError] = useState<string | null>(null);
  const [pageReviewOverview, setPageReviewOverview] = useState<string | null>(null);
  const [pageReviewSuggestions, setPageReviewSuggestions] = useState<PageReviewSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<PageStatus>(page.status);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  // Bumped after a successful save so the History panel re-fetches.
  const [historyToken, setHistoryToken] = useState(0);
  const [lockError, setLockError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [expiryNoticeOpen, setExpiryNoticeOpen] = useState(false);
  const wasExpired = useRef(false);
  const missedHeartbeats = useRef(0);
  const signInHref = `/admin/sign-in?next=${encodeURIComponent(`/admin/pages/${page.id}`)}`;
  const canPublish = canApproveProposed;

  function markSessionExpired() {
    setSessionExpired(true);
    if (!wasExpired.current) {
      wasExpired.current = true;
      setExpiryNoticeOpen(true);
    }
  }

  function markSessionActive() {
    if (wasExpired.current) {
      wasExpired.current = false;
      setSessionExpired(false);
      setExpiryNoticeOpen(false);
    }
  }

  useEffect(() => {
    async function heartbeatLock() {
      try {
        const res = await fetch(`/api/admin/pages/${page.id}/lock`, { method: "POST" });
        if (res.status === 401) {
          markSessionExpired();
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          missedHeartbeats.current += 1;
          if (missedHeartbeats.current >= 3) {
            setLockError(data.message || "Page is locked by another user.");
          }
        } else {
          missedHeartbeats.current = 0;
          setLockError(null);
          markSessionActive();
        }
      } catch {
        missedHeartbeats.current += 1;
        if (missedHeartbeats.current >= 3) {
          setLockError("Page lock could not be renewed. Check your connection before continuing.");
        }
      }
    }

    heartbeatLock();
    const interval = setInterval(heartbeatLock, 60000);

    return () => {
      clearInterval(interval);
      fetch(`/api/admin/pages/${page.id}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [page.id]);

  const previewUrl = useMemo(() => savedUrl ?? `/kb/${kb.slug}/${page.path.join("/")}`, [kb.slug, page.path, savedUrl]);
  const parentSelectOptions = useMemo(
    () => [
      {
        description: `Root of ${kb.title}`,
        label: "Top level",
        value: "",
      },
      ...parentOptions.map((option) => ({
        description: `${option.status} page`,
        label: option.title,
        searchText: `${option.title} ${option.status} ${option.path}`,
        value: option.path,
      })),
    ],
    [kb.title, parentOptions],
  );

  const summaryError = issues.some((issue) => issue.toLowerCase().includes("summary"));
  const contactError = issues.some((issue) => issue.toLowerCase().includes("contact email"));
  const altError = issues.some((issue) => issue.toLowerCase().includes("alt text"));

  useEffect(() => {
    if (altError) {
      markMissingAltImages();
    }
  }, [altError, issues]);

  function buildSnapshot(overrides: { nextReviewDate?: string } = {}) {
    return JSON.stringify({
      title,
      slug,
      summary,
      tags: normalizePageTags(tagsText),
      visibility,
      parentPath,
      ownerLabel,
      contactEmail,
      lastReviewedDate,
      nextReviewDate: overrides.nextReviewDate ?? nextReviewDate,
      reviewAssigneeEmail,
      reviewSlaDays: reviewSlaDays.trim() ? Number(reviewSlaDays) : null,
      relatedPageIds,
      nextStepsHeading,
      nextStepsIntro,
      showToc,
      tocDepth,
      showSummary,
      showPrintButton,
      blocks,
    });
  }

  function buildRevisionSnapshot(overrides: { nextReviewDate?: string } = {}): PageRevisionSnapshot {
    const parentSegments = parentPath ? parentPath.split("/").filter(Boolean) : [];
    return {
      title,
      slug,
      path: [...parentSegments, slug],
      summary,
      tags: normalizePageTags(tagsText),
      status: savedStatus,
      visibility,
      ownerLabel,
      contactEmail,
      lastReviewedDate,
      blocks,
      relatedPageIds,
      relatedAssetIds: page.relatedAssetIds ?? [],
      showToc,
      tocDepth,
      showSummary,
      showPrintButton,
      nextReviewDate: overrides.nextReviewDate ?? nextReviewDate,
      reviewAssigneeEmail: reviewAssigneeEmail.trim(),
      reviewSlaDays: reviewSlaDays.trim() ? Number(reviewSlaDays) : null,
      nextStepsHeading,
      nextStepsIntro,
      nodeKind: page.nodeKind,
      linkUrl: page.linkUrl,
      linkNewTab: page.linkNewTab,
    };
  }

  function applyEditorSnapshot(data: Record<string, unknown>) {
    if (typeof data.title === "string") setTitle(data.title);
    if (typeof data.slug === "string") setSlug(data.slug);
    if (typeof data.summary === "string") setSummary(data.summary);
    if (Array.isArray(data.tags) || typeof data.tags === "string") {
      setTagsText(normalizePageTags(data.tags).join(", "));
    }
    if (data.visibility === "public" || data.visibility === "staff") setVisibility(data.visibility);
    if (Array.isArray(data.path)) {
      setParentPath(data.path.slice(0, -1).join("/"));
    } else if (typeof data.parentPath === "string") {
      setParentPath(data.parentPath);
    }
    if (typeof data.ownerLabel === "string") setOwnerLabel(data.ownerLabel);
    if (typeof data.contactEmail === "string") setContactEmail(data.contactEmail);
    if (typeof data.lastReviewedDate === "string") setLastReviewedDate(data.lastReviewedDate);
    if (typeof data.nextReviewDate === "string") setNextReviewDate(data.nextReviewDate);
    if (typeof data.reviewAssigneeEmail === "string") setReviewAssigneeEmail(data.reviewAssigneeEmail);
    if (typeof data.reviewSlaDays === "number") setReviewSlaDays(String(data.reviewSlaDays));
    if (Array.isArray(data.relatedPageIds)) setRelatedPageIds(data.relatedPageIds as string[]);
    if (typeof data.nextStepsHeading === "string") setNextStepsHeading(data.nextStepsHeading);
    if (typeof data.nextStepsIntro === "string") setNextStepsIntro(data.nextStepsIntro);
    if (typeof data.showToc === "boolean") setShowToc(data.showToc);
    if (typeof data.tocDepth === "number") setTocDepth(data.tocDepth);
    if (typeof data.showSummary === "boolean") setShowSummary(data.showSummary);
    if (typeof data.showPrintButton === "boolean") setShowPrintButton(data.showPrintButton);
    if (Array.isArray(data.blocks)) setBlocks(data.blocks as ContentBlock[]);
    setEditorEpoch((n) => n + 1);
  }

  const currentSnapshot = buildSnapshot();
  const [savedSnapshot, setSavedSnapshot] = useState(currentSnapshot);
  const dirty = currentSnapshot !== savedSnapshot;

  // ----- Work protection: leave-page warning + local draft backup -----
  const backupKey = `kb-editor-backup:${page.id}`;
  const [backupNotice, setBackupNotice] = useState<{ savedAt: string } | null>(null);
  const [serverDraftNotice, setServerDraftNotice] = useState<{
    updatedAt: string;
    snapshot: PageRevisionSnapshot;
  } | null>(null);
  // Bumped when a backup is restored so the document editor remounts with the
  // restored blocks (it keeps its own internal state after mount).
  const [editorEpoch, setEditorEpoch] = useState(0);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Offer to restore a backup left behind by a crash, timeout, or closed tab.
  useEffect(() => {
    let notice: { savedAt: string } | null = null;
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt?: string; snapshot?: string };
      if (!parsed.snapshot || parsed.snapshot === savedSnapshot) {
        localStorage.removeItem(backupKey);
        return;
      }
      notice = { savedAt: parsed.savedAt ?? "" };
    } catch {
      // Corrupt or inaccessible storage — nothing to restore.
    }
    if (!notice) return;
    const pendingNotice = notice;
    const timer = window.setTimeout(() => setBackupNotice(pendingNotice), 0);
    return () => window.clearTimeout(timer);
    // Run once per page; savedSnapshot here is intentionally the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupKey]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/pages/${page.id}/server-draft`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data?.draft?.snapshot) {
          return;
        }
        const snapshot = data.draft.snapshot as PageRevisionSnapshot;
        const draftSnapshot = JSON.stringify({
          title: snapshot.title,
          slug: snapshot.slug,
          summary: snapshot.summary,
          tags: normalizePageTags(snapshot.tags),
          visibility: snapshot.visibility,
          parentPath: snapshot.path.slice(0, -1).join("/"),
          ownerLabel: snapshot.ownerLabel,
          contactEmail: snapshot.contactEmail,
          lastReviewedDate: snapshot.lastReviewedDate,
          nextReviewDate: snapshot.nextReviewDate ?? "",
          reviewAssigneeEmail: snapshot.reviewAssigneeEmail ?? "",
          reviewSlaDays: snapshot.reviewSlaDays ?? null,
          relatedPageIds: snapshot.relatedPageIds ?? [],
          nextStepsHeading: snapshot.nextStepsHeading ?? "",
          nextStepsIntro: snapshot.nextStepsIntro ?? "",
          showToc: snapshot.showToc,
          tocDepth: snapshot.tocDepth,
          showSummary: snapshot.showSummary !== false,
          showPrintButton: snapshot.showPrintButton !== false,
          blocks: snapshot.blocks,
        });
        if (draftSnapshot === savedSnapshot) {
          return;
        }
        setServerDraftNotice({
          updatedAt: typeof data.draft.updatedAt === "string" ? data.draft.updatedAt : "",
          snapshot,
        });
      })
      .catch(() => {
        // Server drafts are optional when DATABASE_URL is unset.
      });
    return () => {
      cancelled = true;
    };
    // Run once per page; savedSnapshot here is intentionally the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  // Continuously stash unsaved work locally (debounced) so it survives
  // crashes and session timeouts. Cleared on successful save.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          backupKey,
          JSON.stringify({ savedAt: new Date().toISOString(), snapshot: currentSnapshot }),
        );
      } catch {
        // Storage full or unavailable; the beforeunload warning still applies.
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [backupKey, currentSnapshot, dirty]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/admin/pages/${page.id}/server-draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: buildRevisionSnapshot() }),
      }).catch(() => {
        // Best-effort sync for multi-device recovery.
      });
    }, 3000);
    return () => clearTimeout(timer);
    // buildRevisionSnapshot closes over the same editor fields as currentSnapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot fields are covered by currentSnapshot
  }, [currentSnapshot, dirty, page.id]);

  function clearBackup() {
    try {
      localStorage.removeItem(backupKey);
    } catch {
      // ignore
    }
    setBackupNotice(null);
  }

  function restoreBackup() {
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) {
        setBackupNotice(null);
        return;
      }
      const parsed = JSON.parse(raw) as { snapshot?: string };
      if (!parsed.snapshot) {
        clearBackup();
        return;
      }
      const data = JSON.parse(parsed.snapshot) as Record<string, unknown>;
      applyEditorSnapshot(data);
    } catch {
      // Corrupt backup: leave current content untouched.
    }
    setBackupNotice(null);
  }

  function restoreServerDraft() {
    if (!serverDraftNotice) {
      return;
    }
    applyEditorSnapshot(serverDraftNotice.snapshot as unknown as Record<string, unknown>);
    setServerDraftNotice(null);
  }

  function dismissServerDraft() {
    fetch(`/api/admin/pages/${page.id}/server-draft`, { method: "DELETE" }).catch(() => {});
    setServerDraftNotice(null);
  }
  const readinessIssues = useMemo(() => {
    const next: string[] = [];
    const requireSummary = kb.requireSummary !== false;
    if (!title.trim()) next.push("Add a page title.");
    if (requireSummary && !summary.trim()) next.push("Add a summary.");
    if (!ownerLabel.trim()) next.push("Add a responsible office.");
    if (!contactEmail.trim() || !EMAIL_PATTERN.test(contactEmail.trim())) {
      next.push("Add a valid contact email.");
    }
    if (!lastReviewedDate.trim()) next.push("Add a last reviewed date.");

    const blockIssues = countBlockIssues(blocks);
    if (blockIssues.h3BeforeH2) {
      next.push("Fix heading order: use an H2 before any H3 (offending headings are outlined in the editor).");
    }
    if (blockIssues.imagesMissingAlt > 0) {
      next.push(
        `${blockIssues.imagesMissingAlt} image${blockIssues.imagesMissingAlt === 1 ? " needs" : "s need"} alt text or decorative status.`,
      );
    }
    if (blockIssues.tablesMissingHeaders > 0) {
      next.push(
        `${blockIssues.tablesMissingHeaders} table${blockIssues.tablesMissingHeaders === 1 ? " needs" : "s need"} a header row or header column.`,
      );
    }

    const linkIssues = hasBadLinks(blocks);
    if (linkIssues.vague) next.push("Replace vague link text such as \"click here\".");
    if (linkIssues.empty) next.push("Add destinations for empty links.");
    return next;
  }, [blocks, contactEmail, kb.requireSummary, lastReviewedDate, ownerLabel, summary, title]);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  useEffect(() => {
    markProblemLinks();
    markHeadingOrderProblems();
  }, [readinessIssues]);

  async function setLifecycleStatus(status: PageStatus) {
    if (lockError) return;
    if (dirty && !window.confirm("You have unsaved changes that won't be included in this action. Continue anyway?")) {
      return;
    }
    setLifecycleBusy(true);
    setError(null);
    setIssues([]);
    setLifecycleMessage(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data.issues) && data.issues.length > 0) {
          setIssues(data.issues as string[]);
        }
        throw new Error(data.message ?? "Could not update page status.");
      }
      setSavedStatus(status);
      setSavedUrl(data.url ?? null);
      setLifecycleMessage(
        status === "published"
          ? "Page published."
          : status === "archived"
            ? "Page archived. It is hidden from the public site."
            : status === "proposed"
              ? "Page submitted for review."
              : "Page is now a draft.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update page status.");
    } finally {
      setLifecycleBusy(false);
    }
  }

  const summaryDraftReadiness = useMemo(
    () => assessPageReadyForSummaryDraft({ title, blocks }),
    [title, blocks],
  );

  async function draftSummaryWithAi() {
    if (lockError) {
      setSummaryDraftHint("This page is locked. Unlock or wait for the lock before drafting a summary.");
      return;
    }
    if (summaryDraftBusy) return;
    if (!summaryDraftReadiness.ok) {
      setSummaryDraftHint(summaryDraftReadiness.message);
      return;
    }
    if (
      summary.trim() &&
      !window.confirm("Replace the current summary with an AI draft? You can still edit it before saving.")
    ) {
      return;
    }
    setSummaryDraftBusy(true);
    setSummaryDraftHint("Drafting summary… this can take up to a minute.");
    setError(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}/summary-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, blocks }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        markSessionExpired();
        throw new Error("Your session expired. Sign in again to draft a summary.");
      }
      if (!response.ok) {
        throw new Error(
          typeof data.message === "string" ? data.message : "Could not draft a summary with AI.",
        );
      }
      if (typeof data.summary !== "string" || !data.summary.trim()) {
        throw new Error("The AI draft was empty.");
      }
      setSummary(data.summary.trim());
      setSummaryDraftHint("AI draft inserted — review and edit before saving.");
    } catch (caught) {
      setSummaryDraftHint(caught instanceof Error ? caught.message : "Could not draft a summary with AI.");
    } finally {
      setSummaryDraftBusy(false);
    }
  }

  async function runPageReviewWithAi() {
    if (lockError || pageReviewBusy) return;
    if (!title.trim() || blocks.length === 0) {
      setPageReviewError("Add a title and page content before running an AI page review.");
      return;
    }
    setPageReviewBusy(true);
    setPageReviewError(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}/page-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, blocks }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        markSessionExpired();
        throw new Error("Your session expired. Sign in again to run a page review.");
      }
      if (!response.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Could not review the page with AI.");
      }
      setPageReviewOverview(typeof data.overview === "string" ? data.overview : "");
      setPageReviewSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (caught) {
      setPageReviewError(caught instanceof Error ? caught.message : "Could not review the page with AI.");
    } finally {
      setPageReviewBusy(false);
    }
  }

  async function verifyPage() {
    if (lockError) return;
    setLifecycleBusy(true);
    setError(null);
    setLifecycleMessage(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}/verify`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not verify page.");
      }
      const verifiedNextReviewDate = typeof data.nextReviewDate === "string" ? data.nextReviewDate : "";
      setVerifiedAt(data.verifiedAt);
      setVerifiedBy(data.verifiedBy);
      setNextReviewDate(verifiedNextReviewDate);
      if (!dirty) {
        setSavedSnapshot(buildSnapshot({ nextReviewDate: verifiedNextReviewDate }));
      }
      setLifecycleMessage("Page verified and review clock reset (6 months).");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify page.");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function submit(status: EditableStatus) {
    if (lockError) return;
    setBusy(status);
    setError(null);
    setIssues([]);
    setSavedUrl(null);
    try {
      const response = await fetch(`/api/admin/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          summary,
          tags: normalizePageTags(tagsText),
          visibility,
          status,
          parentPath: parentPath ? parentPath.split("/") : [],
          sortOrder: page.sortOrder,
          ownerLabel,
          contactEmail,
          lastReviewedDate,
          blocks,
          showToc,
          tocDepth,
          showSummary,
          showPrintButton,
          nextReviewDate,
          reviewAssigneeEmail: reviewAssigneeEmail.trim(),
          reviewSlaDays: reviewSlaDays.trim() ? Number(reviewSlaDays) : null,
          relatedPageIds,
          nextStepsHeading,
          nextStepsIntro,
          ...(canPublish ? { publishAt: publishAt.trim() || null } : {}),
        }),
      });
      if (response.status === 401) {
        markSessionExpired();
        throw new Error("Your session has expired. Sign back in, then save again — your edits are still here.");
      }
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data.issues) && data.issues.length > 0) {
          setIssues(data.issues as string[]);
        }
        throw new Error(data.message ?? "Could not save the page.");
      }
      setSavedStatus(status);
      setSavedUrl(data.url ?? null);
      setSavedSnapshot(currentSnapshot);
      setHistoryToken((token) => token + 1);
      clearBackup();
      setServerDraftNotice(null);
      fetch(`/api/admin/pages/${page.id}/server-draft`, { method: "DELETE" }).catch(() => {});
      markSessionActive();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the page.");
    } finally {
      setBusy(null);
    }
  }

  const isLocked = lockError !== null;
  const statusPillClass =
    savedStatus === "published"
      ? "badge badge--verified"
      : savedStatus === "archived"
        ? "badge badge--archived"
        : savedStatus === "proposed"
          ? "badge badge--warning"
          : "badge badge--draft";
  const statusPillText =
    savedStatus === "published"
      ? "● Published"
      : savedStatus === "archived"
        ? "● Archived"
        : savedStatus === "proposed"
          ? "● Proposed"
          : "● Draft";

  const publishedOverflowItems: OverflowMenuItem[] = [
    {
      label: "Copy / move to another KB…",
      disabled: lifecycleBusy || isLocked,
      onSelect: () => setRelocateOpen(true),
    },
    { divider: true, label: "", onSelect: () => {} },
    {
      label: lifecycleBusy ? "Unpublishing..." : "Unpublish",
      disabled: lifecycleBusy || isLocked,
      onSelect: () => setLifecycleStatus("draft"),
    },
    { divider: true, label: "", onSelect: () => {} },
    {
      danger: true,
      label: lifecycleBusy ? "Archiving..." : "Archive",
      disabled: lifecycleBusy || isLocked,
      onSelect: () => setLifecycleStatus("archived"),
    },
  ];

  const draftOverflowItems: OverflowMenuItem[] = [
    {
      label: "Copy / move to another KB…",
      disabled: lifecycleBusy || isLocked,
      onSelect: () => setRelocateOpen(true),
    },
    { divider: true, label: "", onSelect: () => {} },
    {
      danger: true,
      label: lifecycleBusy ? "Archiving..." : "Archive",
      disabled: lifecycleBusy || isLocked,
      onSelect: () => setLifecycleStatus("archived"),
    },
  ];

  const proposedOverflowItems: OverflowMenuItem[] = [
    {
      label: "Copy / move to another KB…",
      disabled: lifecycleBusy || isLocked,
      onSelect: () => setRelocateOpen(true),
    },
    { divider: true, label: "", onSelect: () => {} },
    {
      label: lifecycleBusy ? "Returning..." : "Return to draft",
      disabled: lifecycleBusy || isLocked,
      onSelect: () => setLifecycleStatus("draft"),
    },
    { divider: true, label: "", onSelect: () => {} },
    {
      danger: true,
      label: lifecycleBusy ? "Archiving..." : "Archive",
      disabled: lifecycleBusy || isLocked,
      onSelect: () => setLifecycleStatus("archived"),
    },
  ];

  const actionButtons = (
    <div className="import-actions">
      <span className={statusPillClass}>{statusPillText}</span>
      {dirty && (
        <span className="unsaved-pill" role="status">
          ● Unsaved changes
        </span>
      )}
      {savedStatus === "archived" ? (
        <button
          className="button"
          disabled={lifecycleBusy || isLocked}
          onClick={() => setLifecycleStatus("draft")}
          type="button"
        >
          {lifecycleBusy ? "Restoring..." : "Restore to draft"}
        </button>
      ) : (
        <>
          <button
            className="button button--ghost"
            disabled={busy !== null || lifecycleBusy || isLocked || !title || blocks.length === 0}
            onClick={() => submit("draft")}
            type="button"
          >
            {busy === "draft" ? "Saving..." : "Save draft"}
          </button>
          {savedStatus === "proposed" ? (
            <>
              <button
                className="button"
                disabled={busy !== null || lifecycleBusy || isLocked || !title || blocks.length === 0}
                onClick={() => submit("proposed")}
                type="button"
              >
                {busy === "proposed" ? "Saving…" : "Save proposal"}
              </button>
              {canPublish ? (
                <button
                  className="button"
                  disabled={lifecycleBusy || isLocked}
                  onClick={() => setLifecycleStatus("published")}
                  type="button"
                >
                  {lifecycleBusy ? "Approving…" : "Approve & publish"}
                </button>
              ) : null}
            </>
          ) : savedStatus === "draft" ? (
            <>
              <button
                className="button button--ghost"
                disabled={busy !== null || lifecycleBusy || isLocked || !title || blocks.length === 0}
                onClick={() => submit("proposed")}
                type="button"
              >
                {busy === "proposed" ? "Submitting…" : "Submit for review"}
              </button>
              {canPublish ? (
                <button
                  className="button"
                  disabled={busy !== null || lifecycleBusy || isLocked || !title || blocks.length === 0}
                  onClick={() => submit("published")}
                  type="button"
                >
                  {busy === "published" ? "Publishing..." : "Save & publish"}
                </button>
              ) : null}
            </>
          ) : (
            <>
              {canPublish ? (
                <button
                  className="button"
                  disabled={busy !== null || lifecycleBusy || isLocked || !title || blocks.length === 0}
                  onClick={() => submit("published")}
                  type="button"
                >
                  {busy === "published" ? "Saving..." : "Save changes"}
                </button>
              ) : (
                <button
                  className="button"
                  disabled={busy !== null || lifecycleBusy || isLocked || !title || blocks.length === 0}
                  onClick={() => submit("proposed")}
                  type="button"
                >
                  {busy === "proposed" ? "Submitting…" : "Submit changes for review"}
                </button>
              )}
            </>
          )}
          <ActionOverflowMenu
            disabled={lifecycleBusy || isLocked}
            items={
              savedStatus === "published"
                ? publishedOverflowItems
                : savedStatus === "proposed"
                  ? proposedOverflowItems
                  : draftOverflowItems
            }
          />
        </>
      )}
      <button className="button button--ghost" onClick={() => setPreviewOpen(true)} type="button">
        Preview draft
      </button>
      {/* Plain anchor: leaving the admin shell needs a full page load so the public
          layout (header/footer/scrolling) is applied. */}
      <a className="button button--ghost" href={previewUrl}>
        View current page
      </a>
    </div>
  );

  return (
    <div className="editor-layout">
      {lockError && (
        <div className="alert alert--error" style={{ marginBottom: "2rem" }}>
          <strong>Edit Lock Active:</strong> {lockError} <br />
          You cannot save changes to this page until the lock expires.
        </div>
      )}

      {sessionExpired && (
        <div className="alert alert--error" role="alert" style={{ marginBottom: "2rem" }}>
          <strong>Signed out:</strong> your session has timed out, so changes cannot be saved right now.{" "}
          <a href={signInHref} rel="noopener" target="_blank">
            Sign in again in a new tab
          </a>
          , then return here and save — your edits are still in this window.
        </div>
      )}

      <StatusModal
        confirmLabel="Got it"
        message="Your sign-in session has timed out, so this page can no longer be saved. Sign in again in a new tab (use the link in the red banner), then come back to this window and save — your edits have not been lost."
        onClose={() => setExpiryNoticeOpen(false)}
        open={expiryNoticeOpen}
        title="Session expired"
        variant="error"
      />

      {previewOpen && (
        <DraftPreviewModal
          blocks={blocks}
          kbSlug={kb.slug}
          onClose={() => setPreviewOpen(false)}
          showSummary={showSummary}
          summary={summary}
          title={title}
        />
      )}

      {backupNotice && (
        <div className="alert" role="alert" style={{ marginBottom: "2rem" }}>
          <strong>Unsaved draft found.</strong> This browser has edits to this page
          {backupNotice.savedAt ? ` from ${formatTimestamp(backupNotice.savedAt)}` : ""} that were never saved to
          the server (for example after a closed tab or session timeout).
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
            <button className="button button--small" onClick={restoreBackup} type="button">
              Restore draft
            </button>
            <button className="button button--small button--ghost" onClick={clearBackup} type="button">
              Discard it
            </button>
          </div>
        </div>
      )}

      {serverDraftNotice && (
        <div className="alert" role="alert" style={{ marginBottom: "2rem" }}>
          <strong>Server draft available.</strong> A newer unsaved version of this page
          {serverDraftNotice.updatedAt ? ` from ${formatTimestamp(serverDraftNotice.updatedAt)}` : ""} is stored on
          the server (for example from another device or browser).
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
            <button className="button button--small" onClick={restoreServerDraft} type="button">
              Restore server draft
            </button>
            <button className="button button--small button--ghost" onClick={dismissServerDraft} type="button">
              Discard it
            </button>
          </div>
        </div>
      )}

      <GuidedTour
        steps={[
          {
            title: "Save often",
            body: "Drafts sync to this browser and the server while you edit. Use Save draft before leaving if you need a named checkpoint.",
          },
          {
            title: "Publishing gates",
            body: "Published pages need summary, contact info, review dates, and accessible images. Fix anything flagged in the readiness panel before proposing or publishing.",
          },
          {
            title: "Blocks and excerpts",
            body: "Use the block toolbar for alerts, cards, and excerpt blocks. Excerpt blocks stay linked to their source page — update the source when content changes.",
          },
        ]}
        tourId="page-editor"
      />

      <form className="form card editor-form" onSubmit={(event) => event.preventDefault()}>
        {error && <p className="error">{error}</p>}
        {issues.length > 0 && (
          <div className="error" role="alert">
            <strong>Publishing is blocked until these are fixed:</strong>
            <ul className="issue-list">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            {altError && (
              <p className="meta">
                Images needing a description are outlined below — click the <strong>Alt</strong> button on each
                to add alt text or mark it decorative.
              </p>
            )}
          </div>
        )}
        {lifecycleMessage && <p className="alert alert--success">{lifecycleMessage}</p>}
        {savedUrl && (
          <p className="alert alert--success">
            Saved as <strong>{savedStatus}</strong>. <a href={savedUrl}>View page</a>
          </p>
        )}
        {actionButtons}

        <details
          className="editor-details"
          onToggle={(event) => setGovernanceOpen(event.currentTarget.open)}
          open={readinessIssues.length > 0 || governanceOpen}
        >
          <summary className="editor-details__summary">Page settings &amp; governance</summary>
          <div className="editor-details__body">
        <fieldset className="fieldset" disabled={isLocked}>
          <legend>Page Settings</legend>
          <label>
            <span className="meta">Title</span>
            <input className="input" onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label>
            <span className="meta">Slug</span>
            <input className="input" onChange={(event) => setSlug(event.target.value)} value={slug} />
          </label>
          <label>
            <span className="meta">Tags / keywords</span>
            <input
              className="input"
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="visa, deadlines, assistantship"
              value={tagsText}
            />
          </label>
          <RelatedPagesEditor
            disabled={isLocked}
            heading={nextStepsHeading}
            intro={nextStepsIntro}
            onChange={setRelatedPageIds}
            onHeadingChange={setNextStepsHeading}
            onIntroChange={setNextStepsIntro}
            options={relatedPageOptions}
            selectedIds={relatedPageIds}
          />
          <div className="summary-field">
            <label>
              <span className="meta">
                Summary
                {kb.requireSummary === false
                  ? " (optional for this KB)"
                  : summaryError
                    ? <span className="field-error-tag"> — required</span>
                    : null}
              </span>
              <textarea
                aria-invalid={summaryError || undefined}
                className={`input${summaryError ? " input--error" : ""}`}
                onChange={(event) => {
                  setSummary(event.target.value);
                  if (summaryDraftHint) setSummaryDraftHint(null);
                }}
                placeholder="Write a short summary, or draft one with AI once the page content is complete."
                rows={3}
                value={summary}
              />
            </label>
            <div className="summary-field__actions">
              <button
                className="button button--small button--ghost"
                disabled={isLocked || summaryDraftBusy || !summaryDraftReadiness.ok}
                onClick={() => void draftSummaryWithAi()}
                title={
                  summaryDraftReadiness.ok
                    ? "Draft a summary from the current title and page body"
                    : summaryDraftReadiness.message
                }
                type="button"
              >
                {summaryDraftBusy ? "Drafting…" : "Draft with AI"}
              </button>
              <p className="meta">
                {summaryDraftBusy
                  ? "Using the current title and body — does not save until you click Save."
                  : summaryDraftReadiness.ok
                    ? "Write the summary yourself, or draft with AI from this page's content."
                    : summaryDraftReadiness.message}
              </p>
            </div>
            {summaryDraftHint ? <p className="meta summary-field__hint">{summaryDraftHint}</p> : null}
          </div>
          <label className="checkbox-inline">
            <input checked={showSummary} onChange={(event) => setShowSummary(event.target.checked)} type="checkbox" />
            <span>Show the summary as a lead paragraph on the page</span>
          </label>
          <label className="checkbox-inline">
            <input
              checked={showPrintButton}
              onChange={(event) => setShowPrintButton(event.target.checked)}
              type="checkbox"
            />
            <span>Show the Print / Save as PDF button</span>
          </label>
          <DropdownSelect
            disabled={isLocked}
            label="Nest under"
            onChange={setParentPath}
            options={parentSelectOptions}
            searchLabel="Search parent pages"
            searchPlaceholder="Search parent pages..."
            value={parentPath}
          />
          <div className="field-row field-row--toc-settings">
            <DropdownSelect
              disabled={isLocked}
              label="Visibility"
              onChange={(value) => setVisibility(value === "staff" ? "staff" : "public")}
              options={visibilityOptions}
              searchable={false}
              value={visibility}
            />
            <label className="checkbox-inline toc-control__show">
              <input
                checked={showToc}
                disabled={isLocked}
                onChange={(event) => setShowToc(event.target.checked)}
                type="checkbox"
              />
              <span>Show on page</span>
            </label>
            <DropdownSelect
              disabled={isLocked || !showToc}
              label="Table of contents"
              onChange={(value) => setTocDepth(Number(value))}
              options={tocDepthOptions}
              searchable={false}
              value={String(tocDepth)}
            />
          </div>
        </fieldset>

        <fieldset className="fieldset" disabled={isLocked}>
          <legend>Governance</legend>
          <p className="meta">
            Required before publishing. Responsible office and contact are kept in admin metadata; the public page shows
            only the &ldquo;Updated on&rdquo; date.
          </p>
          <label>
            <span className="meta">Responsible office</span>
            <input
              className="input"
              onChange={(event) => setOwnerLabel(event.target.value)}
              placeholder="e.g. Graduate School Outreach and Technology"
              value={ownerLabel}
            />
          </label>
          <label>
            <span className="meta">
              Contact email{contactError && <span className="field-error-tag"> — needs a valid address</span>}
            </span>
            <input
              aria-invalid={contactError || undefined}
              className={`input${contactError ? " input--error" : ""}`}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="name@wsu.edu"
              type="email"
              value={contactEmail}
            />
          </label>
          <label>
            <span className="meta">Last reviewed date</span>
            <input
              className="input"
              onChange={(event) => setLastReviewedDate(event.target.value)}
              type="date"
              value={lastReviewedDate}
            />
          </label>
          <label>
            <span className="meta">Next review date</span>
            <input
              className="input"
              onChange={(event) => setNextReviewDate(event.target.value)}
              type="date"
              value={nextReviewDate || ""}
            />
          </label>
          <label>
            <span className="meta">Review assignee email</span>
            <input
              className="input"
              onChange={(event) => setReviewAssigneeEmail(event.target.value)}
              placeholder="editor@example.edu"
              type="email"
              value={reviewAssigneeEmail}
            />
          </label>
          <label>
            <span className="meta">Review SLA warning (days before due)</span>
            <input
              className="input"
              min={1}
              onChange={(event) => setReviewSlaDays(event.target.value)}
              placeholder="14"
              type="number"
              value={reviewSlaDays}
            />
          </label>
          {canPublish ? (
            <label>
              <span className="meta">Schedule publish (optional)</span>
              <input
                className="input"
                onChange={(event) => setPublishAt(event.target.value)}
                type="datetime-local"
                value={publishAt ? publishAt.slice(0, 16) : ""}
              />
            </label>
          ) : null}
          {verifiedAt && (
            <p className="meta" style={{ color: "var(--success)" }}>
              ✓ Verified on {formatTimestamp(verifiedAt)}{verifiedBy ? ` by ${verifiedBy}` : ""}
            </p>
          )}
          <div style={{ marginTop: "0.5rem" }}>
            <button
              className="button button--small button--ghost"
              disabled={lifecycleBusy || isLocked}
              onClick={verifyPage}
              type="button"
            >
              {lifecycleBusy ? "Verifying..." : "Verify now (resets 6-month clock)"}
            </button>
          </div>
        </fieldset>
          </div>
        </details>

        <fieldset className="fieldset editor-content" disabled={isLocked}>
          <legend>Content</legend>
          <div className={`editor-readiness ${readinessIssues.length === 0 ? "is-ready" : ""}`}>
            <strong>Publishing readiness</strong>
            {readinessIssues.length === 0 ? (
              <p className="meta">No accessibility or governance blockers detected in the current draft.</p>
            ) : (
              <ul className="issue-list">
                {readinessIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="editor-content__ai-layout">
            <PageDocumentEditor
              blocks={blocks}
              editorPalette={themeToEditorPalette(kb.theme ?? DEFAULT_THEME)}
              kbId={kb.id}
              kbSlug={kb.slug}
              key={`${page.id}:${editorEpoch}`}
              onChange={setBlocks}
              pageUrl={previewUrl}
            />
            <AiPageReviewPanel
              blocks={blocks}
              busy={pageReviewBusy}
              disabled={isLocked}
              error={pageReviewError}
              onApplyBlocks={(next) => {
                setBlocks(next);
                setEditorEpoch((epoch) => epoch + 1);
              }}
              onReject={(id) =>
                setPageReviewSuggestions((current) => current.filter((item) => item.id !== id))
              }
              onRejectAll={() => {
                setPageReviewSuggestions([]);
                setPageReviewOverview(null);
              }}
              onRunReview={() => void runPageReviewWithAi()}
              overview={pageReviewOverview}
              suggestions={pageReviewSuggestions}
            />
          </div>
        </fieldset>

        <details className="editor-details">
          <summary className="editor-details__summary">Revision history</summary>
          <div className="editor-details__body">
            <PageHistoryPanel
              canPublish={canPublish}
              isLocked={isLocked}
              kbSlug={kb.slug}
              onRestored={() => window.location.reload()}
              pageId={page.id}
              reloadToken={historyToken}
            />
          </div>
        </details>

        {actionButtons}
      </form>
      {relocateOpen && (
        <RelocatePageDialog
          destinationKbs={destinationKbs}
          onCancel={() => setRelocateOpen(false)}
          onComplete={({ editHref }) => {
            window.location.assign(editHref);
          }}
          pageId={page.id}
          pageTitle={title || page.title}
          sourceKbId={kb.id}
        />
      )}
    </div>
  );
}
