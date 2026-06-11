"use client";

import { BookOpen, Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface KbScopeOption {
  id: string;
  slug: string;
  title: string;
}

interface KbScopePickerProps {
  kbs: KbScopeOption[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
}

export function KbScopePicker({ kbs, selectedSlug, onSelect }: KbScopePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const labelId = useId();
  const listboxId = useId();
  const searchFieldId = useId();

  const selectedKb = kbs.find((kb) => kb.slug === selectedSlug) ?? kbs[0];

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kbs.filter(
      (kb) => q === "" || kb.title.toLowerCase().includes(q) || kb.slug.toLowerCase().includes(q),
    );
  }, [kbs, query]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(Math.max(index, 0), Math.max(matches.length - 1, 0)));
  }, [matches.length]);

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
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  function closeMenu() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    triggerRef.current?.focus();
  }

  function selectKb(slug: string) {
    onSelect(slug);
    closeMenu();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (matches[activeIndex]) {
        event.preventDefault();
        selectKb(matches[activeIndex].slug);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(matches.length - 1, 0));
    }
  }

  if (!selectedKb) {
    return null;
  }

  const searchPlaceholder =
    kbs.length === 1
      ? "Search 1 knowledge base…"
      : `Search ${kbs.length} knowledge bases…`;

  return (
    <div className="kb-picker kb-picker--scope" ref={rootRef}>
      <span className="kb-picker__label" id={labelId}>
        Knowledge base
      </span>

      <div className="kb-picker__control">
        <button
          ref={triggerRef}
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby={labelId}
          className="kb-picker__trigger"
          onClick={() => setOpen((value) => !value)}
          onKeyDown={onTriggerKeyDown}
          type="button"
        >
          <BookOpen aria-hidden className="kb-picker__trigger-icon" size={18} strokeWidth={1.75} />
          <span className="kb-picker__trigger-text">{selectedKb.title}</span>
          <ChevronDown
            aria-hidden
            className={`kb-picker__trigger-chevron${open ? " is-open" : ""}`}
            size={18}
            strokeWidth={1.75}
          />
        </button>

        {open && (
          <div className="kb-picker__popover">
            <div className="kb-picker__search">
              <label className="sr-only" htmlFor={searchFieldId}>
                Search knowledge bases
              </label>
              <Search aria-hidden className="kb-picker__search-icon" size={16} strokeWidth={1.75} />
              <input
                ref={searchRef}
                aria-autocomplete="list"
                aria-controls={listboxId}
                className="kb-picker__search-input"
                id={searchFieldId}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                type="search"
                value={query}
              />
            </div>

            <ul className="kb-picker__menu" id={listboxId} role="listbox">
              {matches.length === 0 ? (
                <li className="kb-picker__empty" aria-disabled>
                  No matches.
                </li>
              ) : (
                matches.map((kb, index) => {
                  const isSelected = kb.slug === selectedSlug;
                  return (
                    <li
                      key={kb.id}
                      aria-selected={isSelected}
                      className={`kb-picker__option${index === activeIndex ? " is-active" : ""}${
                        isSelected ? " is-selected" : ""
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectKb(kb.slug);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      role="option"
                    >
                      <span className="kb-picker__option-title">{kb.title}</span>
                      {isSelected && (
                        <Check
                          aria-hidden
                          className="kb-picker__option-check"
                          size={16}
                          strokeWidth={2}
                        />
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
