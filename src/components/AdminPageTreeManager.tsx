"use client";

import {
  Archive,
  ArrowDown,
  ArrowUp,
  CircleCheck,
  CornerDownRight,
  CornerUpLeft,
  GripVertical,
  House,
} from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { WorkspaceEmptyState } from "@/components/WorkspaceEmptyState";
import {
  resolveDropProjection,
  resolveReorderAnchor,
  type DropZone,
} from "@/lib/page-tree-drop";
import { useModalA11y } from "@/lib/use-modal-a11y";
import type { KbPage, KnowledgeBase, PageStatus } from "@/lib/types";

type PageItem = Pick<
  KbPage,
  "id" | "path" | "sortOrder" | "status" | "title" | "updatedDisplayDate" | "visibility" | "nextReviewDate" | "nodeKind"
>;

type DropTargetState = {
  id: string;
  zone: DropZone;
  insertDepth: number;
};

function pathKey(path: string[]) {
  return path.join("/");
}

function hasPathPrefix(path: string[], prefix: string[]) {
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
}

function normalizeSiblingOrders(pages: PageItem[]) {
  const grouped = new Map<string, PageItem[]>();
  for (const page of pages) {
    const parent = pathKey(page.path.slice(0, -1));
    grouped.set(parent, [...(grouped.get(parent) ?? []), page]);
  }
  const nextById = new Map(pages.map((page) => [page.id, { ...page }]));
  for (const siblings of grouped.values()) {
    siblings
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
      .forEach((page, index) => {
        nextById.get(page.id)!.sortOrder = (index + 1) * 10;
      });
  }
  return pages.map((page) => nextById.get(page.id)!);
}

function sortedPages(pages: PageItem[]) {
  const childrenByParent = new Map<string, PageItem[]>();
  for (const page of pages) {
    const parent = pathKey(page.path.slice(0, -1));
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), page]);
  }
  const sortSiblingGroup = (items: PageItem[]) =>
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const output: PageItem[] = [];
  const visit = (parentPath: string[]) => {
    const children = sortSiblingGroup([...(childrenByParent.get(pathKey(parentPath)) ?? [])]);
    for (const child of children) {
      output.push(child);
      visit(child.path);
    }
  };
  visit([]);
  return output;
}

function movePage(pages: PageItem[], pageId: string, parentPath: string[], sortOrder: number) {
  const moving = pages.find((page) => page.id === pageId);
  if (!moving) {
    return pages;
  }
  if (hasPathPrefix(parentPath, moving.path)) {
    return pages;
  }

  const oldPath = moving.path;
  const newPath = [...parentPath, moving.path[moving.path.length - 1]];
  return normalizeSiblingOrders(
    pages.map((page) => {
      if (page.id === moving.id) {
        return { ...page, path: newPath, sortOrder };
      }
      if (hasPathPrefix(page.path, oldPath) && page.path.length > oldPath.length) {
        return { ...page, path: [...newPath, ...page.path.slice(oldPath.length)] };
      }
      return page;
    }),
  );
}

function getSiblings(pages: PageItem[], page: PageItem) {
  const parent = pathKey(page.path.slice(0, -1));
  return pages
    .filter((candidate) => pathKey(candidate.path.slice(0, -1)) === parent)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

function hasChildPages(pages: PageItem[], page: PageItem) {
  return pages.some(
    (candidate) =>
      candidate.path.length === page.path.length + 1 && hasPathPrefix(candidate.path, page.path),
  );
}

function layoutSignature(pages: PageItem[]) {
  return pages
    .map((page) => `${page.id}:${pathKey(page.path)}:${page.sortOrder}`)
    .sort()
    .join("|");
}

function statusLabel(status: PageStatus) {
  if (status === "published") return "Published";
  if (status === "archived") return "Archived";
  return "Draft";
}

function statusBadgeClass(status: PageStatus) {
  if (status === "published") return "badge badge--verified";
  if (status === "archived") return "badge badge--archived";
  return "badge badge--draft";
}

function publishToggleLabel(status: PageStatus) {
  if (status === "published") return "Unpublish";
  if (status === "archived") return "Restore to draft";
  return "Publish";
}

function publishToggleBusyLabel(status: PageStatus) {
  if (status === "published") return "Unpublishing...";
  if (status === "archived") return "Restoring...";
  return "Publishing...";
}

function nextStatusForToggle(status: PageStatus): PageStatus {
  if (status === "published") return "draft";
  if (status === "archived") return "draft";
  return "published";
}

interface TreeRowMenuItem {
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  icon?: ReactNode;
  label: string;
  onSelect: () => void;
}

function TreeRowMenu({
  disabled = false,
  items,
  menuLabel,
  triggerLabel,
  triggerContent,
}: {
  disabled?: boolean;
  items: TreeRowMenuItem[];
  menuLabel: string;
  triggerLabel: string;
  triggerContent: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const actionableItems = items.filter((item) => !item.divider);
  const clampedActiveIndex = Math.min(activeIndex, Math.max(actionableItems.length - 1, 0));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
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
      setOpen(true);
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
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
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerLabel}
        className="icon-button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        type="button"
      >
        {triggerContent}
      </button>
      {open && (
        <ul
          aria-label={menuLabel}
          className="kb-picker__menu tree-editor__menu"
          id={menuId}
          onKeyDown={onMenuKeyDown}
          role="menu"
        >
          {items.map((item, index) => {
            if (item.divider) {
              return <li key={`divider-${index}`} className="tree-editor__menu-divider" role="separator" />;
            }
            const currentIndex = actionableItems.indexOf(item);
            return (
              <li key={item.label} role="none">
                <button
                  className={`kb-picker__option tree-editor__menu-item${
                    currentIndex === clampedActiveIndex ? " is-active" : ""
                  }${item.danger ? " tree-editor__menu-item--danger" : ""}`}
                  disabled={item.disabled}
                  aria-label={item.label}
                  onClick={() => selectItem(currentIndex)}
                  onMouseEnter={() => setActiveIndex(currentIndex)}
                  role="menuitem"
                  title={item.label}
                  type="button"
                >
                  {item.icon ? (
                    <span className="tree-editor__menu-item-icon-wrap">
                      <span aria-hidden className="tree-editor__menu-item-icon">
                        {item.icon}
                      </span>
                      <span className="kb-picker__option-title tree-editor__menu-item-label">
                        {item.label}
                      </span>
                    </span>
                  ) : (
                    <span className="kb-picker__option-title">{item.label}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface PageTreeMoveButtonsProps {
  canMoveDown: boolean;
  canMoveInto: boolean;
  canMoveOut: boolean;
  canMoveUp: boolean;
  onMoveDown: () => void;
  onMoveInto: () => void;
  onMoveOut: () => void;
  onMoveUp: () => void;
  pageTitle: string;
}

function PageTreeMoveButtons({
  canMoveDown,
  canMoveInto,
  canMoveOut,
  canMoveUp,
  onMoveDown,
  onMoveInto,
  onMoveOut,
  onMoveUp,
  pageTitle,
}: PageTreeMoveButtonsProps) {
  return (
    <div className="tree-editor__move-buttons" role="group" aria-label={`Reorder ${pageTitle}`}>
      <button
        aria-label={`Move ${pageTitle} up`}
        className="icon-button tree-editor__move-button"
        disabled={!canMoveUp}
        onClick={onMoveUp}
        type="button"
      >
        <ArrowUp aria-hidden size={16} strokeWidth={1.75} />
      </button>
      <button
        aria-label={`Move ${pageTitle} down`}
        className="icon-button tree-editor__move-button"
        disabled={!canMoveDown}
        onClick={onMoveDown}
        type="button"
      >
        <ArrowDown aria-hidden size={16} strokeWidth={1.75} />
      </button>
      <button
        aria-label={`Indent ${pageTitle} under the previous page`}
        className="icon-button tree-editor__move-button"
        disabled={!canMoveInto}
        onClick={onMoveInto}
        type="button"
      >
        <CornerDownRight aria-hidden size={16} strokeWidth={1.75} />
      </button>
      <button
        aria-label={`Outdent ${pageTitle} one level`}
        className="icon-button tree-editor__move-button"
        disabled={!canMoveOut}
        onClick={onMoveOut}
        type="button"
      >
        <CornerUpLeft aria-hidden size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

interface PageTreeOverflowMenuProps {
  busy: boolean;
  canDelete: boolean;
  homepageBusy: boolean;
  isHomepage: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onHomepage: () => void;
  onPublishToggle: () => void;
  page: PageItem;
  statusBusy: boolean;
}

function PageTreeOverflowMenu({
  busy: _busy,
  canDelete,
  homepageBusy,
  isHomepage,
  onArchive,
  onDelete,
  onHomepage,
  onPublishToggle,
  page,
  statusBusy,
}: PageTreeOverflowMenuProps) {
  const items = useMemo(() => {
    const entries: TreeRowMenuItem[] = [];

    if (!isHomepage && page.status !== "archived" && (page.nodeKind ?? "page") === "page") {
      entries.push({
        icon: <House aria-hidden size={16} strokeWidth={1.75} />,
        label: homepageBusy ? "Setting..." : "Set Home",
        disabled: homepageBusy,
        onSelect: onHomepage,
      });
    }

    entries.push({
      icon: <CircleCheck aria-hidden size={16} strokeWidth={1.75} />,
      label: statusBusy ? publishToggleBusyLabel(page.status) : publishToggleLabel(page.status),
      disabled: statusBusy,
      onSelect: onPublishToggle,
    });

    if (canDelete && page.status !== "archived") {
      entries.push({ divider: true, label: "", onSelect: () => {} });
      entries.push({
        danger: true,
        icon: <Archive aria-hidden size={16} strokeWidth={1.75} />,
        label: statusBusy ? "Archiving..." : "Archive",
        disabled: statusBusy,
        onSelect: onArchive,
      });
    }

    if (canDelete && page.status === "archived") {
      entries.push({ divider: true, label: "", onSelect: () => {} });
      entries.push({
        danger: true,
        label: statusBusy ? "Deleting..." : "Delete permanently",
        disabled: statusBusy,
        onSelect: onDelete,
      });
    }

    return entries;
  }, [
    canDelete,
    homepageBusy,
    isHomepage,
    onArchive,
    onDelete,
    onHomepage,
    onPublishToggle,
    page.nodeKind,
    page.status,
    statusBusy,
  ]);

  return (
    <TreeRowMenu
      items={items}
      menuLabel={`More actions for ${page.title}`}
      triggerContent="⋯"
      triggerLabel={`More actions for ${page.title}`}
    />
  );
}

function ConfirmArchiveDialog({
  pageTitle,
  onCancel,
  onConfirm,
}: {
  pageTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel);
  const headingId = useId();

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="media-picker__overlay" onClick={onCancel} role="presentation">
      <div
        aria-labelledby={headingId}
        aria-modal="true"
        className="media-picker link-dialog"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong id={headingId}>Archive page</strong>
          <button aria-label="Cancel archive" className="icon-button" onClick={onCancel} type="button">
            ✕
          </button>
        </div>
        <div className="media-picker__body form">
          <p className="meta">
            Archive &ldquo;{pageTitle}&rdquo;? It will be hidden from the public site until restored.
          </p>
          <div className="admin-inline-actions">
            <button className="button button--ghost" onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="button" onClick={onConfirm} type="button">
              Archive page
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConfirmDeleteDialog({
  pageTitle,
  onCancel,
  onConfirm,
}: {
  pageTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel);
  const headingId = useId();

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="media-picker__overlay" onClick={onCancel} role="presentation">
      <div
        aria-labelledby={headingId}
        aria-modal="true"
        className="media-picker link-dialog"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="media-picker__head">
          <strong id={headingId}>Delete page permanently</strong>
          <button aria-label="Cancel delete" className="icon-button" onClick={onCancel} type="button">
            ✕
          </button>
        </div>
        <div className="media-picker__body form">
          <p className="meta">
            Permanently delete &ldquo;{pageTitle}&rdquo;? This cannot be undone. Only archived pages with no
            child pages or references can be deleted.
          </p>
          <label htmlFor="delete-confirmation">
            <span className="meta">Type DELETE to confirm</span>
            <input
              className="input"
              data-autofocus
              id="delete-confirmation"
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </label>
          <div className="admin-inline-actions">
            <button className="button button--ghost" onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className="button"
              disabled={confirmation !== "DELETE"}
              onClick={onConfirm}
              type="button"
            >
              Delete permanently
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function AdminPageTreeManager({
  canDelete,
  initialPages,
  kb,
}: {
  canDelete: boolean;
  initialPages: PageItem[];
  kb: KnowledgeBase;
}) {
  const [pages, setPages] = useState(() => normalizeSiblingOrders(initialPages));
  const [savedBaseline, setSavedBaseline] = useState(() => normalizeSiblingOrders(initialPages));
  const [trackedInitialPages, setTrackedInitialPages] = useState(initialPages);
  const [showArchived, setShowArchived] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const treeListRef = useRef<HTMLUListElement>(null);
  const [busy, setBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [homepageBusyId, setHomepageBusyId] = useState<string | null>(null);
  const [homepagePageId, setHomepagePageId] = useState<string | null>(kb.homepagePageId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [liveMessage, setLiveMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PageItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PageItem | null>(null);

  if (trackedInitialPages !== initialPages) {
    const normalized = normalizeSiblingOrders(initialPages);
    setTrackedInitialPages(initialPages);
    setPages(normalized);
    setSavedBaseline(normalized);
  }

  const visiblePages = useMemo(
    () => (showArchived ? pages : pages.filter((page) => page.status !== "archived")),
    [pages, showArchived],
  );
  const displayPages = useMemo(() => sortedPages(visiblePages), [visiblePages]);
  const archivedCount = useMemo(
    () => pages.filter((page) => page.status === "archived").length,
    [pages],
  );
  const hasUnsavedChanges = layoutSignature(pages) !== layoutSignature(savedBaseline);

  function announceMove(text: string) {
    setLiveMessage(text);
  }

  function canDropOn(target: PageItem) {
    if (!draggedId || draggedId === target.id) {
      return false;
    }
    const dragged = pages.find((page) => page.id === draggedId);
    return Boolean(dragged && !hasPathPrefix(target.path, dragged.path));
  }

  function rowDragOver(event: React.DragEvent<HTMLDivElement>, target: PageItem) {
    if (!canDropOn(target)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const treeLeft = treeListRef.current?.getBoundingClientRect().left ?? rect.left;
    const targetDepth = Math.max(0, target.path.length - 1);
    const { zone, insertDepth } = resolveDropProjection(
      event.clientX,
      event.clientY,
      rect.top,
      rect.height,
      treeLeft,
      targetDepth,
    );
    setDropTarget((current) =>
      current?.id === target.id && current.zone === zone && current.insertDepth === insertDepth
        ? current
        : { id: target.id, zone, insertDepth },
    );
  }

  function rowDragLeave(event: React.DragEvent<HTMLDivElement>, target: PageItem) {
    if (
      dropTarget?.id === target.id &&
      !event.currentTarget.contains(event.relatedTarget as Node | null)
    ) {
      setDropTarget(null);
    }
  }

  function rowDrop(event: React.DragEvent<HTMLDivElement>, target: PageItem) {
    event.preventDefault();
    // Prefer last projected target; if dragover never fired, reorder after — never nest by accident.
    const zone = dropTarget?.id === target.id ? dropTarget.zone : "after";
    const insertDepth =
      dropTarget?.id === target.id ? dropTarget.insertDepth : Math.max(0, target.path.length - 1);
    const dragged = pages.find((page) => page.id === draggedId);
    setDropTarget(null);
    if (!draggedId || !dragged || !canDropOn(target)) {
      setDraggedId(null);
      return;
    }
    if (zone === "into") {
      const childOrders = pages
        .filter((page) => pathKey(page.path.slice(0, -1)) === pathKey(target.path))
        .map((page) => page.sortOrder);
      setPages((current) => movePage(current, draggedId, target.path, Math.max(0, ...childOrders) + 10));
      announceMove(`${dragged.title} nested under ${target.title}.`);
    } else {
      const { parentPath, anchorPath, position } = resolveReorderAnchor(
        target.path,
        zone,
        insertDepth,
      );
      const anchor =
        pages.find((page) => pathKey(page.path) === pathKey(anchorPath)) ?? target;
      setPages((current) =>
        movePage(
          current,
          draggedId,
          parentPath,
          position === "before" ? anchor.sortOrder - 1 : anchor.sortOrder + 1,
        ),
      );
      const depthNote =
        anchorPath.length < target.path.length ? ` (outdented to /${anchorPath.join("/")})` : "";
      announceMove(
        `${dragged.title} moved ${position === "before" ? "above" : "below"} ${anchor.title}${depthNote}.`,
      );
    }
    setDraggedId(null);
  }

  function movePageUp(pageId: string) {
    const page = pages.find((entry) => entry.id === pageId);
    if (!page) return;
    const siblings = getSiblings(pages, page);
    const index = siblings.findIndex((entry) => entry.id === pageId);
    if (index <= 0) return;
    const previous = siblings[index - 1];
    setPages((current) => movePage(current, pageId, page.path.slice(0, -1), previous.sortOrder - 1));
    announceMove(`${page.title} moved up to position ${index} of ${siblings.length}.`);
  }

  function movePageDown(pageId: string) {
    const page = pages.find((entry) => entry.id === pageId);
    if (!page) return;
    const siblings = getSiblings(pages, page);
    const index = siblings.findIndex((entry) => entry.id === pageId);
    if (index < 0 || index >= siblings.length - 1) return;
    const next = siblings[index + 1];
    setPages((current) => movePage(current, pageId, page.path.slice(0, -1), next.sortOrder + 1));
    announceMove(`${page.title} moved down to position ${index + 2} of ${siblings.length}.`);
  }

  function movePageInto(pageId: string) {
    const page = pages.find((entry) => entry.id === pageId);
    if (!page) return;
    const siblings = getSiblings(pages, page);
    const index = siblings.findIndex((entry) => entry.id === pageId);
    if (index <= 0) return;
    const parent = siblings[index - 1];
    const childOrders = pages
      .filter((entry) => pathKey(entry.path.slice(0, -1)) === pathKey(parent.path))
      .map((entry) => entry.sortOrder);
    setPages((current) =>
      movePage(current, pageId, parent.path, Math.max(0, ...childOrders) + 10),
    );
    announceMove(`${page.title} nested under ${parent.title}.`);
  }

  function movePageOut(pageId: string) {
    const page = pages.find((entry) => entry.id === pageId);
    if (!page || page.path.length <= 1) return;
    const parentPath = page.path.slice(0, -1);
    const grandparentPath = parentPath.slice(0, -1);
    const parent = pages.find((entry) => pathKey(entry.path) === pathKey(parentPath));
    if (!parent) return;
    setPages((current) => movePage(current, pageId, grandparentPath, parent.sortOrder + 1));
    announceMove(`${page.title} moved out one level.`);
  }

  async function saveLayout() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/pages/layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kbId: kb.id,
          items: pages.map((page) => ({
            pageId: page.id,
            parentPath: page.path.slice(0, -1),
            sortOrder: page.sortOrder,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not save page tree.");
      }
      setSavedBaseline(pages);
      setMessage("Page tree saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save page tree.");
    } finally {
      setBusy(false);
    }
  }

  async function setPageStatus(pageId: string, status: PageStatus) {
    setStatusBusyId(pageId);
    setError(null);
    setMessage(null);
    setIssues([]);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}/status`, {
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
      setPages((current) =>
        current.map((page) =>
          page.id === pageId
            ? { ...page, status, updatedDisplayDate: new Date().toISOString().slice(0, 10) }
            : page,
        ),
      );
      setMessage(
        status === "published"
          ? "Page published."
          : status === "archived"
            ? "Page archived. It is hidden from the public site."
            : "Page saved as draft.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update page status.");
    } finally {
      setStatusBusyId(null);
    }
  }

  async function setHomepage(pageId: string | null) {
    setHomepageBusyId(pageId ?? "__clear__");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/kbs/${kb.id}/homepage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not update knowledge base homepage.");
      }
      setHomepagePageId(data.homepagePageId ?? null);
      setMessage(pageId ? "Knowledge base homepage updated." : "Knowledge base homepage cleared.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update knowledge base homepage.");
    } finally {
      setHomepageBusyId(null);
    }
  }

  async function handleDelete(pageId: string) {
    setStatusBusyId(pageId);
    try {
      const response = await fetch(`/api/admin/pages/${pageId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Could not delete page.");
      }

      setPages((current) => current.filter((page) => page.id !== pageId));
      setMessage("Page deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete page.");
    } finally {
      setStatusBusyId(null);
      setDeleteTarget(null);
    }
  }

  if (initialPages.length === 0) {
    return (
      <WorkspaceEmptyState
        action={{ href: `/admin/pages/new?kb=${kb.id}`, label: "New page" }}
        message="No pages yet"
      />
    );
  }

  return (
    <div className="page-tree-manager">
      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>
      {error && <p className="error">{error}</p>}
      {issues.length > 0 && (
        <div className="error" role="alert">
          <strong>Publishing is blocked until these are fixed:</strong>
          <ul className="issue-list">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {message && <p className="alert alert--success">{message}</p>}

      <div className="admin-actions">
        {hasUnsavedChanges && <span className="unsaved-pill">Unsaved tree changes</span>}
        {hasUnsavedChanges && (
          <button className="button" disabled={busy} onClick={saveLayout} type="button">
            {busy ? "Saving..." : "Save page tree"}
          </button>
        )}
        {homepagePageId && (
          <button
            className="button button--ghost"
            disabled={homepageBusyId === "__clear__"}
            onClick={() => setHomepage(null)}
            type="button"
          >
            {homepageBusyId === "__clear__" ? "Clearing..." : "Use generated KB landing"}
          </button>
        )}
        {archivedCount > 0 && (
          <label className="meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <input
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              type="checkbox"
            />
            Show archived ({archivedCount})
          </label>
        )}
      </div>

      <p className="meta">
        Use the arrow buttons to move up/down or indent/outdent. Drag works the same way: drop on
        the <strong>middle</strong> of a row to nest, on the <strong>top or bottom edge</strong> to
        reorder, or drag <strong>left</strong> while over a nested row to outdent. Alt + arrow keys
        on the grip also work.
      </p>

      <ul
        aria-label={`${kb.title} page tree editor`}
        className="tree-editor"
        ref={treeListRef}
        role="tree"
      >
        {displayPages.map((page) => {
          const depth = Math.max(0, page.path.length - 1);
          const siblings = getSiblings(visiblePages, page);
          const posinset = siblings.findIndex((entry) => entry.id === page.id) + 1;
          const isHomepage = homepagePageId === page.id;
          const hasChildren = hasChildPages(visiblePages, page);
          const canMoveUp = posinset > 1;
          const canMoveDown = posinset < siblings.length;
          const canMoveInto = posinset > 1;
          const canMoveOut = depth > 0;

          return (
            <li
              key={page.id}
              aria-expanded={hasChildren ? true : undefined}
              aria-level={depth + 1}
              aria-posinset={posinset}
              aria-selected={false}
              aria-setsize={siblings.length}
              className="tree-editor__item"
              data-depth={depth}
              draggable
              onDragEnd={() => {
                setDraggedId(null);
                setDropTarget(null);
              }}
              onDragStart={() => setDraggedId(page.id)}
              role="treeitem"
              style={{ marginLeft: `${depth * 1.25}rem` }}
            >
              <div
                className={`tree-editor__row${
                  dropTarget?.id === page.id ? ` is-drop-${dropTarget.zone}` : ""
                }${draggedId === page.id ? " is-dragging" : ""}`}
                onDragLeave={(event) => rowDragLeave(event, page)}
                onDragOver={(event) => rowDragOver(event, page)}
                onDrop={(event) => rowDrop(event, page)}
                style={
                  dropTarget?.id === page.id && dropTarget.zone !== "into"
                    ? ({
                        "--tree-drop-indent": `${dropTarget.insertDepth * 1.25}rem`,
                      } as CSSProperties)
                    : undefined
                }
              >
                <div className="tree-editor__handle-group">
                  <button
                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowRight Alt+ArrowLeft"
                    aria-label={`Drag to reorder ${page.title}. Alt + arrow keys also move this page.`}
                    className="tree-editor__handle"
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" && event.altKey) {
                        event.preventDefault();
                        movePageUp(page.id);
                      } else if (event.key === "ArrowDown" && event.altKey) {
                        event.preventDefault();
                        movePageDown(page.id);
                      } else if (event.key === "ArrowRight" && event.altKey) {
                        event.preventDefault();
                        movePageInto(page.id);
                      } else if (event.key === "ArrowLeft" && event.altKey) {
                        event.preventDefault();
                        movePageOut(page.id);
                      }
                    }}
                    type="button"
                  >
                    <GripVertical aria-hidden size={18} strokeWidth={1.75} />
                  </button>
                  <PageTreeMoveButtons
                    canMoveDown={canMoveDown}
                    canMoveInto={canMoveInto}
                    canMoveOut={canMoveOut}
                    canMoveUp={canMoveUp}
                    onMoveDown={() => movePageDown(page.id)}
                    onMoveInto={() => movePageInto(page.id)}
                    onMoveOut={() => movePageOut(page.id)}
                    onMoveUp={() => movePageUp(page.id)}
                    pageTitle={page.title}
                  />
                </div>

                <div>
                  <div className="tree-editor__title-row">
                    <strong>{page.title}</strong>
                    {page.nodeKind === "group" && <span className="badge">Group heading</span>}
                    {page.nodeKind === "link" && <span className="badge">Link</span>}
                    {isHomepage && <span className="badge badge--verified">Homepage</span>}
                    {page.path.length === 1 && <span className="badge badge--section">Section</span>}
                    <span className={statusBadgeClass(page.status)}>{statusLabel(page.status)}</span>
                    <span className={page.visibility === "staff" ? "badge badge--staff" : "badge"}>
                      {page.visibility === "staff" ? "Staff only" : "Public"}
                    </span>
                    {page.nextReviewDate && new Date(page.nextReviewDate) <= new Date() && (
                      <span className="badge badge--warning">Needs review</span>
                    )}
                  </div>
                  <div className="meta">
                    /{page.path.join("/")} · Updated {page.updatedDisplayDate}
                  </div>
                  {isHomepage && (page.status !== "published" || page.visibility === "staff") && (
                    <div className="meta" style={{ marginTop: "0.25rem" }}>
                      Public visitors will see the generated landing page until this homepage is published and
                      public.
                    </div>
                  )}
                </div>

                <div className="tree-editor__actions">
                  <Link className="button button--ghost button--small" href={`/admin/pages/${page.id}`}>
                    Edit
                  </Link>
                  <PageTreeOverflowMenu
                    busy={busy}
                    canDelete={canDelete}
                    homepageBusy={homepageBusyId === page.id}
                    isHomepage={isHomepage}
                    onArchive={() => setArchiveTarget(page)}
                    onDelete={() => setDeleteTarget(page)}
                    onHomepage={() => setHomepage(page.id)}
                    onPublishToggle={() => setPageStatus(page.id, nextStatusForToggle(page.status))}
                    page={page}
                    statusBusy={statusBusyId === page.id}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {archiveTarget && (
        <ConfirmArchiveDialog
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => {
            void setPageStatus(archiveTarget.id, "archived");
            setArchiveTarget(null);
          }}
          pageTitle={archiveTarget.title}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget.id)}
          pageTitle={deleteTarget.title}
        />
      )}
    </div>
  );
}
