"use client";

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
  options: Array<{ id: string; title: string; path: string }>;
  selectedIds: string[];
}) {
  const selectedSet = new Set(selectedIds);
  const orderedSelected = selectedIds
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is { id: string; title: string; path: string } => Boolean(option));
  const unselected = options.filter((option) => !selectedSet.has(option.id));

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

  return (
    <fieldset className="fieldset" style={{ border: "none", padding: 0, margin: 0 }}>
      <legend className="meta">Related pages / next steps</legend>
      <p className="meta">Choose pages and drag order with the arrows. Shown to readers after this article.</p>
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
        <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.75rem" }}>
          <span className="meta">Selected order</span>
          {orderedSelected.map((option, index) => (
            <div key={option.id} style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
              <span style={{ minWidth: "1.5rem" }}>{index + 1}.</span>
              <span style={{ flex: 1 }}>
                {option.title}
                <span className="meta"> /{option.path}</span>
              </span>
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
                onClick={() => onChange(selectedIds.filter((id) => id !== option.id))}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.75rem", maxHeight: "12rem", overflow: "auto" }}>
        <span className="meta">Add pages</span>
        {unselected.length === 0 ? (
          <p className="meta">{options.length === 0 ? "No other pages in this knowledge base yet." : "All pages selected."}</p>
        ) : (
          unselected.map((option) => (
            <label key={option.id} style={{ alignItems: "flex-start", display: "flex", gap: "0.5rem" }}>
              <input
                disabled={disabled}
                onChange={() => onChange([...selectedIds, option.id])}
                type="checkbox"
              />
              <span>
                {option.title}
                <span className="meta"> /{option.path}</span>
              </span>
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}
