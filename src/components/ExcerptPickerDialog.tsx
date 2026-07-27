"use client";

import { useEffect, useState } from "react";

interface ExcerptOption {
  id: string;
  title: string;
  path: string;
}

export function ExcerptPickerDialog({
  kbId,
  onClose,
  onSelect,
}: {
  kbId: string;
  onClose: () => void;
  onSelect: (sourcePageId: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ExcerptOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/pages?kbId=${encodeURIComponent(kbId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { pages?: Array<{ id: string; title: string; path: string[] }> }) => {
        if (cancelled) {
          return;
        }
        setOptions(
          (data.pages ?? []).map((page) => ({
            id: page.id,
            title: page.title,
            path: page.path.join("/"),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kbId]);

  const filtered = options.filter((option) => {
    const haystack = `${option.title} ${option.path}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="modal-backdrop" role="presentation">
      <div aria-labelledby="excerpt-picker-title" className="modal" role="dialog">
        <h2 id="excerpt-picker-title">Insert excerpt from another page</h2>
        <label>
          <span className="meta">Search pages</span>
          <input
            autoFocus
            className="input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title or path"
            value={query}
          />
        </label>
        {loading ? (
          <p className="meta">Loading pages…</p>
        ) : filtered.length === 0 ? (
          <p className="meta">No matching pages in this knowledge base.</p>
        ) : (
          <ul className="import-outline excerpt-picker-list">
            {filtered.slice(0, 30).map((option) => (
              <li key={option.id}>
                <button
                  className="link-button"
                  onClick={() => onSelect(option.id, option.title)}
                  type="button"
                >
                  {option.title}
                </button>
                <span className="meta"> /{option.path}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="modal__actions">
          <button className="button" onClick={onClose} type="button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
