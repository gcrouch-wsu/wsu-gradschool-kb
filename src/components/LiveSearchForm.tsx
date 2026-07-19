"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface LiveResult {
  type: "page" | "asset";
  title: string;
  href: string;
  kbTitle?: string;
}

export function LiveSearchForm({
  action,
  inputId,
  kbSlug,
  label,
  showKbTitles,
}: {
  action: string;
  inputId: string;
  kbSlug?: string;
  label: string;
  showKbTitles?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LiveResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    return () => {
      window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const listboxId = `${inputId}-listbox`;
  const options = results ?? [];
  const showPanel = open && results !== null;
  const optionCount = options.length + (showPanel ? 1 : 0);

  function closePanel() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function onInput(value: string) {
    setQuery(value);
    window.clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      setResults(null);
      closePanel();
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void fetchResults(trimmed);
    }, 250);
  }

  async function fetchResults(q: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const params = new URLSearchParams({ q });
      if (kbSlug) {
        params.set("kb", kbSlug);
      }
      const response = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { results?: LiveResult[] };
      setResults(Array.isArray(data.results) ? data.results : []);
      setOpen(true);
      setActiveIndex(-1);
    } catch {
      // Aborted or offline: leave the current panel state alone.
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (showPanel) {
        event.preventDefault();
        closePanel();
      }
      return;
    }
    if (!showPanel || optionCount === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % optionCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + optionCount) % optionCount);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      if (activeIndex < options.length) {
        window.location.assign(options[activeIndex].href);
      } else {
        formRef.current?.requestSubmit();
      }
    }
  }

  function onBlur(event: React.FocusEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      closePanel();
    }
  }

  return (
    <form
      action={action}
      className="kb-search-widget"
      method="get"
      onBlur={onBlur}
      ref={formRef}
      role="search"
    >
      <label className="kb-search-widget__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="kb-search-widget__combobox">
        <div className="kb-search-widget__row">
          <input
            aria-activedescendant={activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={showPanel}
            autoComplete="off"
            className="input kb-search-widget__input"
            id={inputId}
            name="q"
            onChange={(event) => onInput(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search…"
            role="combobox"
            type="search"
            value={query}
          />
          <button className="kb-search-widget__submit" type="submit">
            <Search aria-hidden size={16} strokeWidth={2} />
            <span className="sr-only">Search</span>
          </button>
        </div>
        {showPanel && (
          <ul aria-label="Search suggestions" className="kb-search-widget__panel" id={listboxId} role="listbox">
            {options.length === 0 && (
              <li
                aria-disabled="true"
                aria-selected={false}
                className="kb-search-widget__option kb-search-widget__option--empty"
                role="option"
              >
                No matches yet
              </li>
            )}
            {options.map((result, index) => (
              <li
                aria-selected={index === activeIndex}
                className={`kb-search-widget__option${index === activeIndex ? " is-active" : ""}`}
                id={`${inputId}-option-${index}`}
                key={`${result.href}-${index}`}
                onClick={() => window.location.assign(result.href)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
              >
                <span className="kb-search-widget__option-title">{result.title}</span>
                {showKbTitles && result.kbTitle && (
                  <span className="kb-search-widget__option-meta">{result.kbTitle}</span>
                )}
                {result.type === "asset" && <span className="kb-search-widget__option-meta">File</span>}
              </li>
            ))}
            <li
              aria-selected={activeIndex === options.length}
              className={`kb-search-widget__option kb-search-widget__option--all${
                activeIndex === options.length ? " is-active" : ""
              }`}
              id={`${inputId}-option-${options.length}`}
              onClick={() => formRef.current?.requestSubmit()}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(options.length)}
              role="option"
            >
              See all results →
            </li>
          </ul>
        )}
      </div>
      <span className="sr-only" role="status">
        {showPanel
          ? options.length === 0
            ? "No suggestions available"
            : `${options.length} suggestion${options.length === 1 ? "" : "s"} available`
          : ""}
      </span>
    </form>
  );
}
