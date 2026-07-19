import { LiveSearchForm } from "@/components/LiveSearchForm";
import type { KnowledgeBase } from "@/lib/types";

export function KbSearchWidget({ kb }: { kb: KnowledgeBase }) {
  if (!kb.searchWidgetEnabled) {
    return null;
  }
  const scopeAll = kb.searchWidgetScope === "all";
  const action = scopeAll ? "/search" : `/kb/${kb.slug}/search`;
  const label =
    (kb.searchWidgetLabel ?? "").trim() ||
    (scopeAll ? "Search all knowledge bases" : `Search ${kb.title}`);
  return (
    <LiveSearchForm
      action={action}
      inputId={`kb-search-${kb.id}`}
      kbSlug={scopeAll ? undefined : kb.slug}
      label={label}
      showKbTitles={scopeAll}
    />
  );
}

export function HomeSearchWidget() {
  return (
    <div className="kb-search-widget--home">
      <LiveSearchForm
        action="/search"
        inputId="home-search"
        label="Search all knowledge bases"
        showKbTitles
      />
    </div>
  );
}
