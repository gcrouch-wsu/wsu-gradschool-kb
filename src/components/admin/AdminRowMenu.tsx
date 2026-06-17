"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface AdminRowMenuItem {
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  label: string;
  onSelect?: () => void;
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
    item.onSelect?.();
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
    <div className="admin-row-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerLabel}
        className="icon-button admin-row-menu__trigger"
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
          className="admin-row-menu__menu"
          id={menuId}
          onKeyDown={onMenuKeyDown}
          role="menu"
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
