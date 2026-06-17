"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

export interface DropdownSelectOption {
  description?: string;
  icon?: ReactNode;
  label: string;
  searchText?: string;
  value: string;
}

interface DropdownSelectProps {
  className?: string;
  disabled?: boolean;
  emptyMessage?: string;
  label: string;
  onChange: (value: string) => void;
  options: DropdownSelectOption[];
  placeholder?: string;
  searchable?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  triggerIcon?: ReactNode;
  value: string;
}

export function DropdownSelect({
  className,
  disabled = false,
  emptyMessage = "No matches.",
  label,
  onChange,
  options,
  placeholder = "Select an option",
  searchable = true,
  searchLabel,
  searchPlaceholder,
  triggerIcon,
  value,
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const labelId = useId();
  const listboxId = useId();
  const searchFieldId = useId();

  const selectedOption = options.find((option) => option.value === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((option) => {
      if (!q) return true;
      return `${option.label} ${option.description ?? ""} ${option.searchText ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [options, query]);

  const clampedActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(matches.length - 1, 0));

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  useEffect(() => {
    if (open && searchable) {
      searchRef.current?.focus();
    }
  }, [open, searchable]);

  function closeMenu() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    triggerRef.current?.focus();
  }

  function selectValue(nextValue: string) {
    onChange(nextValue);
    closeMenu();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (open && !searchable) {
      onPickerKeyDown(event);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  }

  function onPickerKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(Math.min(clampedActiveIndex + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(clampedActiveIndex - 1, 0));
    } else if (event.key === "Enter") {
      if (matches[clampedActiveIndex]) {
        event.preventDefault();
        selectValue(matches[clampedActiveIndex].value);
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

  const visibleIcon = selectedOption?.icon ?? triggerIcon;

  return (
    <div className={`kb-picker kb-picker--scope${className ? ` ${className}` : ""}`} ref={rootRef}>
      <span className="kb-picker__label" id={labelId}>
        {label}
      </span>

      <div className="kb-picker__control">
        <button
          ref={triggerRef}
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby={labelId}
          className="kb-picker__trigger"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={onTriggerKeyDown}
          type="button"
        >
          {visibleIcon && <span className="kb-picker__trigger-icon">{visibleIcon}</span>}
          <span className="kb-picker__trigger-text">{selectedOption?.label ?? placeholder}</span>
          <ChevronDown
            aria-hidden
            className={`kb-picker__trigger-chevron${open ? " is-open" : ""}`}
            size={18}
            strokeWidth={1.75}
          />
        </button>

        {open && (
          <div className="kb-picker__popover">
            {searchable && (
              <div className="kb-picker__search">
                <label className="sr-only" htmlFor={searchFieldId}>
                  {searchLabel ?? `Search ${label.toLowerCase()}`}
                </label>
                <Search aria-hidden className="kb-picker__search-icon" size={16} strokeWidth={1.75} />
                <input
                  ref={searchRef}
                  aria-autocomplete="list"
                  aria-controls={listboxId}
                  className="kb-picker__search-input"
                  disabled={disabled}
                  id={searchFieldId}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onPickerKeyDown}
                  placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}...`}
                  type="search"
                  value={query}
                />
              </div>
            )}

            <ul className="kb-picker__menu" id={listboxId} onKeyDown={onPickerKeyDown} role="listbox">
              {matches.length === 0 ? (
                <li className="kb-picker__empty" role="presentation">
                  {emptyMessage}
                </li>
              ) : (
                matches.map((option, index) => {
                  const isSelected = option.value === value;
                  return (
                    <li
                      key={option.value}
                      aria-selected={isSelected}
                      className={`kb-picker__option${index === clampedActiveIndex ? " is-active" : ""}${
                        isSelected ? " is-selected" : ""
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectValue(option.value);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      role="option"
                    >
                      <span className="kb-picker__option-main">
                        {option.icon && <span className="kb-picker__option-icon">{option.icon}</span>}
                        <span>
                          <span className="kb-picker__option-title">{option.label}</span>
                          {option.description && (
                            <span className="kb-picker__option-slug">{option.description}</span>
                          )}
                        </span>
                      </span>
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
