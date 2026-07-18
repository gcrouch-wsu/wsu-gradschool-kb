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
    <form action={action} className="kb-search-widget" method="get" role="search">
      <label className="kb-search-widget__label" htmlFor={`kb-search-${kb.id}`}>
        {label}
      </label>
      <div className="kb-search-widget__row">
        <input
          className="input kb-search-widget__input"
          id={`kb-search-${kb.id}`}
          name="q"
          placeholder="Search…"
          type="search"
        />
        <button className="button button--small" type="submit">
          Search
        </button>
      </div>
    </form>
  );
}

export function HomeSearchWidget() {
  return (
    <form action="/search" className="kb-search-widget kb-search-widget--home" method="get" role="search">
      <label className="kb-search-widget__label" htmlFor="home-search">
        Search all knowledge bases
      </label>
      <div className="kb-search-widget__row">
        <input
          className="input kb-search-widget__input"
          id="home-search"
          name="q"
          placeholder="Search…"
          type="search"
        />
        <button className="button button--small" type="submit">
          Search
        </button>
      </div>
    </form>
  );
}
