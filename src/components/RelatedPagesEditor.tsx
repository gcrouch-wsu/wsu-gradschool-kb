"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  RELATED_PAGES_SOFT_MAX,
  canAddRelatedPage,
  filterRelatedPageMatches,
  type RelatedPageOption,
} from "@/lib/related-pages";

export function RelatedPagesEditor({
  disabled,
  intro,
  heading,
  onIntroChange,
  onHeadingChange,
  onChange,
  options,
  selectedIds,
}: {
  disabled?: boolean;
  intro: string;
  heading: string;
  onIntroChange: (value: string) => void;
  onHeadingChange: (value: string) => void;
  onChange: (ids: string[]) => void;
  options: RelatedPageOption[];
  selectedIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const searchId = useId();

  const orderedSelected = useMemo(
    () =>
      selectedIds
        .map((id) => options.find((option) => option.id === id))
        .filter((option): option is RelatedPageOption => Boolean(option)),
    [options, selectedIds],
  );

  const atLimit = !canAddRelatedPage(selectedIds.length);
  const matches = useMemo(
    () => (atLimit ? [] : filterRelatedPageMatches(options, selectedIds, query)),
    [atLimit, options, selectedIds, query],
  );
  const clampedActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(matches.length - 1, 0));

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function move(id: string, direction: -1 | 1) {
    const index = selectedIds.indexOf(id);
    if (index < 0) {
      return;
    }
    const target = index + direction;
    if (target < 0 || target >= selectedIds.length) {
      return;
    }
    const next = [...selectedIds];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function add(id: string) {
    if (disabled || atLimit || selectedIds.includes(id)) {
      return;
    }
    onChange([...selectedIds, id]);
    setQuery("");
    setActiveIndex(0);
    setOpen(false);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(selectedIds.filter((selectedId) => selectedId !== id));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (atLimit) {
        return;
      }
      setOpen(true);
      setActiveIndex(Math.min(clampedActiveIndex + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(clampedActiveIndex - 1, 0));
    } else if (event.key === "Enter") {
      if (open && matches[clampedActiveIndex]) {
        event.preventDefault();
        add(matches[clampedActiveIndex].id);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <fieldset className="fieldset related-pages-editor" style={{ border: "none", padding: 0, margin: 0 }}>
      <legend className="meta">Related pages / next steps</legend>
      <p className="meta">
        Search and add up to {RELATED_PAGES_SOFT_MAX} pages. Shown to readers after this article.
      </p>
      <label>
        <span className="meta">Section heading</span>
        <input
          className="input"
          disabled={disabled}
          onChange={(event) => onHeadingChange(event.target.value)}
          placeholder="Next steps"
          value={heading}
        />
      </label>
      <label>
        <span className="meta">Intro line</span>
        <input
          className="input"
          disabled={disabled}
          onChange={(event) => onIntroChange(event.target.value)}
          placeholder="Continue with these related pages."
          value={intro}
        />
      </label>

      {orderedSelected.length > 0 && (
        <div className="related-pages-editor__selected">
          <span className="meta">
            Selected order ({orderedSelected.length}/{RELATED_PAGES_SOFT_MAX})
          </span>
          <ul className="related-pages-editor__list" aria-label="Selected related pages">
            {orderedSelected.map((option, index) => (
              <li className="related-pages-editor__item" key={option.id}>
                <span className="related-pages-editor__index" aria-hidden="true">
                  {index + 1}.
                </span>
                <span className="related-pages-editor__item-main">
                  <span className="related-pages-editor__item-title">{option.title}</span>
                  <span className="meta">/{option.path}</span>
                </span>
                <div className="related-pages-editor__item-actions">
                  <button
                    aria-label={`Move ${option.title} up`}
                    className="button button--small button--ghost"
                    disabled={disabled || index === 0}
                    onClick={() => move(option.id, -1)}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${option.title} down`}
                    className="button button--small button--ghost"
                    disabled={disabled || index === orderedSelected.length - 1}
                    onClick={() => move(option.id, 1)}
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    aria-label={`Remove ${option.title}`}
                    className="button button--small button--ghost"
                    disabled={disabled}
                    onClick={() => remove(option.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="related-pages-editor__add" ref={rootRef}>
        <label className="meta" htmlFor={searchId}>
          Add pages
        </label>
        <div className="kb-picker__field">
          <input
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={open && !atLimit}
            className="input"
            disabled={disabled || atLimit || options.length === 0}
            id={searchId}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => {
              if (!atLimit) {
                setOpen(true);
              }
            }}
            onKeyDown={onKeyDown}
            placeholder={
              atLimit
                ? `Limit reached (${RELATED_PAGES_SOFT_MAX}) — remove one to add another`
                : options.length === 0
                  ? "No other pages in this knowledge base yet"
                  : "Search by title or path…"
            }
            ref={inputRef}
            role="combobox"
            type="search"
            value={query}
          />
          {open && !atLimit && !disabled && (
            <ul className="kb-picker__menu" id={listboxId} role="listbox">
              {matches.length === 0 ? (
                <li className="kb-picker__empty" role="presentation">
                  {query.trim()
                    ? "No matching pages."
                    : selectedIds.length >= options.length
                      ? "All available pages are already selected."
                      : "No pages available."}
                </li>
              ) : (
                matches.map((option, index) => (
                  <li
                    aria-selected={index === clampedActiveIndex}
                    className={`kb-picker__option ${index === clampedActiveIndex ? "is-active" : ""}`}
                    key={option.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      add(option.id);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                  >
                    <span className="kb-picker__option-title">{option.title}</span>
                    <span className="kb-picker__option-slug">
                      /{option.path}
                      {option.status && option.status !== "published" ? ` · ${option.status}` : ""}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        {atLimit ? (
          <p className="meta">
            Soft limit of {RELATED_PAGES_SOFT_MAX} related pages keeps “Next steps” useful. Remove one to
            add another.
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
