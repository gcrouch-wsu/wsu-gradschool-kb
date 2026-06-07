"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KnowledgeBase } from "@/lib/types";

interface KbAssignmentPickerProps {
  kbs: KnowledgeBase[];
  selected: string[];
  onChange: (next: string[]) => void;
  legend?: string;
}

export default function KbAssignmentPicker({
  kbs,
  selected,
  onChange,
  legend = "Knowledge bases this editor can edit",
}: KbAssignmentPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selectedKbs = useMemo(
    () => selected.map((id) => kbs.find((kb) => kb.id === id)).filter((kb): kb is KnowledgeBase => Boolean(kb)),
    [selected, kbs],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kbs.filter(
      (kb) =>
        !selected.includes(kb.id) &&
        (q === "" || kb.title.toLowerCase().includes(q) || kb.slug.toLowerCase().includes(q)),
    );
  }, [kbs, selected, query]);

  useEffect(() => {
    setActiveIndex((i) => Math.min(Math.max(i, 0), Math.max(matches.length - 1, 0)));
  }, [matches.length]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function add(kbId: string) {
    onChange([...new Set([...selected, kbId])]);
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }

  function remove(kbId: string) {
    onChange(selected.filter((id) => id !== kbId));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && matches[activeIndex]) {
        e.preventDefault();
        add(matches[activeIndex].id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  }

  return (
    <fieldset className="fieldset">
      <legend>{legend}</legend>
      {kbs.length === 0 ? (
        <p className="meta">No knowledge bases yet.</p>
      ) : (
        <div className="kb-picker" ref={rootRef}>
          {selectedKbs.length > 0 && (
            <ul className="kb-picker__chips" aria-label="Assigned knowledge bases">
              {selectedKbs.map((kb) => (
                <li className="kb-picker__chip" key={kb.id}>
                  <span>{kb.title}</span>
                  <button
                    type="button"
                    className="kb-picker__chip-remove"
                    aria-label={`Remove ${kb.title}`}
                    onClick={() => remove(kb.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="kb-picker__field">
            <input
              ref={inputRef}
              className="input"
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              placeholder={selectedKbs.length > 0 ? "Add another knowledge base…" : "Search knowledge bases…"}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
            />

            {open && (
              <ul className="kb-picker__menu" id={listboxId} role="listbox">
                {matches.length === 0 ? (
                  <li className="kb-picker__empty" aria-disabled>
                    {selected.length === kbs.length ? "All knowledge bases assigned." : "No matches."}
                  </li>
                ) : (
                  matches.map((kb, index) => (
                    <li
                      key={kb.id}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`kb-picker__option ${index === activeIndex ? "is-active" : ""}`}
                      onMouseEnter={() => setActiveIndex(index)}

                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(kb.id);
                      }}
                    >
                      <span className="kb-picker__option-title">{kb.title}</span>
                      <span className="kb-picker__option-slug">/{kb.slug}</span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
}

