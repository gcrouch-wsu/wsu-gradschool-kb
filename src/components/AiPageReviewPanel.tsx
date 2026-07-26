"use client";

import { useMemo, useState } from "react";
import {
  applyPageReviewSuggestion,
  suggestionIsActionable,
  type PageReviewSuggestion,
} from "@/lib/page-review-core";
import type { ContentBlock } from "@/lib/types";

interface AiPageReviewPanelProps {
  busy: boolean;
  disabled?: boolean;
  error: string | null;
  onApplyBlocks: (blocks: ContentBlock[]) => void;
  onReject: (id: string) => void;
  onRejectAll: () => void;
  onRunReview: () => void;
  overview: string | null;
  suggestions: PageReviewSuggestion[];
  blocks: ContentBlock[];
}

function focusBlockInEditor(blockId: string) {
  const el = document.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
  if (!(el instanceof HTMLElement)) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ai-review-target");
  window.setTimeout(() => el.classList.remove("ai-review-target"), 1600);
}

export function AiPageReviewPanel({
  busy,
  disabled,
  error,
  onApplyBlocks,
  onReject,
  onRejectAll,
  onRunReview,
  overview,
  suggestions,
  blocks,
}: AiPageReviewPanelProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const actionable = useMemo(() => suggestions.filter(suggestionIsActionable), [suggestions]);

  function acceptOne(suggestion: PageReviewSuggestion) {
    const next = applyPageReviewSuggestion(blocks, suggestion);
    if (!next) return;
    onApplyBlocks(next);
    onReject(suggestion.id);
    focusBlockInEditor(suggestion.blockId);
  }

  function acceptAll() {
    let next = blocks;
    const appliedIds: string[] = [];
    for (const suggestion of actionable) {
      const patched = applyPageReviewSuggestion(next, suggestion);
      if (patched) {
        next = patched;
        appliedIds.push(suggestion.id);
      }
    }
    if (appliedIds.length === 0) return;
    onApplyBlocks(next);
    for (const id of appliedIds) onReject(id);
  }

  return (
    <aside className="ai-review-panel" aria-label="AI page review">
      <div className="ai-review-panel__header">
        <h3 className="ai-review-panel__title">AI page review</h3>
        <button
          className="button button--small"
          disabled={disabled || busy}
          onClick={onRunReview}
          type="button"
        >
          {busy ? "Reviewing…" : suggestions.length > 0 ? "Re-run review" : "Review with AI"}
        </button>
      </div>
      <p className="meta ai-review-panel__hint">
        Checks style, readability, grammar, and image alt text. Accept applies into this draft only —
        Save when ready. Prompts: KB override → site default → built-in.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {overview ? <p className="ai-review-panel__overview">{overview}</p> : null}

      {suggestions.length > 0 ? (
        <>
          <div className="admin-actions ai-review-panel__batch">
            <button
              className="button button--small"
              disabled={disabled || busy || actionable.length === 0}
              onClick={acceptAll}
              type="button"
            >
              Accept all actionable ({actionable.length})
            </button>
            <button
              className="button button--small button--ghost"
              disabled={disabled || busy}
              onClick={onRejectAll}
              type="button"
            >
              Dismiss all
            </button>
          </div>
          <ul className="ai-review-panel__list">
            {suggestions.map((suggestion) => {
              const actionableItem = suggestionIsActionable(suggestion);
              return (
                <li
                  className={`ai-review-panel__item${activeId === suggestion.id ? " is-active" : ""}`}
                  key={suggestion.id}
                >
                  <button
                    className="ai-review-panel__select"
                    onClick={() => {
                      setActiveId(suggestion.id);
                      focusBlockInEditor(suggestion.blockId);
                    }}
                    type="button"
                  >
                    <span className={`ai-review-panel__severity ai-review-panel__severity--${suggestion.severity}`}>
                      {suggestion.severity}
                    </span>
                    <span className="ai-review-panel__kind">{suggestion.kind}</span>
                    <span className="ai-review-panel__message">{suggestion.message}</span>
                    {suggestion.currentSnippet ? (
                      <span className="ai-review-panel__snippet">“{suggestion.currentSnippet}”</span>
                    ) : null}
                    {suggestion.proposedAlt ? (
                      <span className="ai-review-panel__proposal">Alt → {suggestion.proposedAlt}</span>
                    ) : null}
                    {suggestion.proposedText ? (
                      <span className="ai-review-panel__proposal">Text → {suggestion.proposedText}</span>
                    ) : null}
                  </button>
                  <div className="ai-review-panel__actions">
                    <button
                      className="button button--small"
                      disabled={disabled || busy || !actionableItem}
                      onClick={() => acceptOne(suggestion)}
                      title={actionableItem ? "Apply this suggestion to the draft" : "No concrete replacement text"}
                      type="button"
                    >
                      Accept
                    </button>
                    <button
                      className="button button--small button--ghost"
                      disabled={disabled || busy}
                      onClick={() => onReject(suggestion.id)}
                      type="button"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        !busy && !error && <p className="meta">No review yet. Run a review when the page content is ready.</p>
      )}
    </aside>
  );
}
