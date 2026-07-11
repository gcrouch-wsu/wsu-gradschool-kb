"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface AdminRowMenuItem {
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  label: string;
  onSelect?: () => void;
}

function menuPlacementFor(trigger: HTMLButtonElement | null) {
  const rect = trigger?.getBoundingClientRect();
  if (!rect) return null;
  const right = Math.max(document.documentElement.clientWidth - rect.right, 8);
  const spaceBelow = window.innerHeight - rect.bottom;
  return spaceBelow < 320 && rect.top > spaceBelow
    ? { bottom: window.innerHeight - rect.top + 6, right }
    : { top: rect.bottom + 6, right };
}

export function AdminRowMenu({
  disabled = false,
  items,
  menuLabel,
  triggerContent,
  triggerLabel,
}: {
  disabled?: boolean;
  items: AdminRowMenuItem[];
  menuLabel: string;
  triggerContent: ReactNode;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
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

  useEffect(() => {
    if (!open) return;
    function onViewportChange() {
      const next = menuPlacementFor(triggerRef.current);
      if (next) {
        setPlacement(next);
      }
    }
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  function openMenu() {
    const next = menuPlacementFor(triggerRef.current);
    if (!next) return;
    setPlacement(next);
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectItem(index: number) {
    const item = actionableItems[index];
    if (!item || item.disabled) return;
    item.onSelect?.();
    closeMenu();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
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
    <div className="admin-row-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerLabel}
        className="icon-button admin-row-menu__trigger"
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        type="button"
      >
        {triggerContent}
      </button>
      {open && (
        <ul
          aria-label={menuLabel}
          className="admin-row-menu__menu"
          id={menuId}
          onKeyDown={onMenuKeyDown}
          role="menu"
          style={
            placement
              ? {
                  position: "fixed",
                  top: placement.top ?? "auto",
                  bottom: placement.bottom ?? "auto",
                  right: placement.right,
                  margin: 0,
                }
              : undefined
          }
        >
          {items.map((item, index) => {
            if (item.divider) {
              return <li key={`divider-${index}`} className="admin-row-menu__divider" role="separator" />;
            }
            const currentIndex = actionableItems.indexOf(item);
            return (
              <li key={item.label} role="none">
                <button
                  className={`admin-row-menu__item${
                    currentIndex === clampedActiveIndex ? " is-active" : ""
                  }${item.danger ? " admin-row-menu__item--danger" : ""}`}
                  disabled={item.disabled}
                  onClick={() => selectItem(currentIndex)}
                  onMouseEnter={() => setActiveIndex(currentIndex)}
                  role="menuitem"
                  type="button"
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
