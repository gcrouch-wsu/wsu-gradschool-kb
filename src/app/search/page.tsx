import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import {
  getAssetById,
  getKbById,
  getVisiblePagesForKb,
  searchKb,
  type SearchResult,
} from "@/lib/kb-store";
import { suggestDidYouMean } from "@/lib/search-suggest";
import { globalSearchScope } from "@/lib/search-scope";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";

const SEARCH_LIMIT = 30;
const SEARCH_WINDOW_SECONDS = 60;

export const metadata: Metadata = {
  title: "Search | WSU Knowledge Base",
  description: "Search across readable WSU knowledge bases.",
};

interface ResultWithHref {
  result: SearchResult;
  href: string;
}

interface SearchGroup {
  kbId: string;
  kbTitle: string;
  results: ResultWithHref[];
}

const searchScope = globalSearchScope;

async function resolveResults(results: SearchResult[]): Promise<SearchGroup[]> {
  const groups = new Map<string, SearchGroup>();
  const resolved = await Promise.all(results.map(async (result) => {
    const kb = await getKbById(result.kbId);
    if (!kb) {
      return null;
    }
    const href = result.type === "page"
      ? `/kb/${kb.slug}/${result.path.join("/")}`
      : await assetHref(result);
    return { result, href, kb };
  }));

  for (const entry of resolved) {
    if (!entry) {
      continue;
    }
    const { result, href, kb } = entry;
    const group = groups.get(kb.id) ?? { kbId: kb.id, kbTitle: kb.title, results: [] };
    group.results.push({ result, href });
    groups.set(kb.id, group);
  }
  return [...groups.values()];
}

async function assetHref(result: Extract<SearchResult, { type: "asset" }>) {
  const asset = await getAssetById(result.id);
  const homeKb = asset ? await getKbById(asset.homeKbId) : null;
  return asset && homeKb ? `/kb/${homeKb.slug}/files/${asset.slug}` : "#";
}

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { q = "", tag = "" } = await searchParams;
  const trimmedQuery = q.trim();
  const trimmedTag = tag.trim();
  const hasSearch = Boolean(trimmedQuery || trimmedTag);

  let rateLimited = false;
  if (hasSearch) {
    const clientKey = clientKeyFromHeaders(await headers());
    rateLimited = !(await rateLimit(`search:${clientKey}`, SEARCH_LIMIT, SEARCH_WINDOW_SECONDS)).allowed;
  }

  const scope = await searchScope();
  const results = rateLimited || !hasSearch
    ? []
    : await searchKb(undefined, trimmedQuery, scope.includeStaff, {
        ...scope.options,
        tag: trimmedTag || undefined,
      });
  const groups = await resolveResults(results);

  let didYouMean: string | null = null;
  if (!rateLimited && trimmedQuery && results.length === 0) {
    const titles: string[] = [];
    if (scope.options.includeAllKbs) {
      const { getAllKbsForAdmin } = await import("@/lib/kb-store");
      for (const kb of await getAllKbsForAdmin()) {
        for (const page of await getVisiblePagesForKb(kb.id, true)) {
          titles.push(page.title);
        }
      }
    } else {
      for (const kbId of scope.options.readableKbIds ?? []) {
        for (const page of await getVisiblePagesForKb(kbId, scope.includeStaff)) {
          titles.push(page.title);
        }
      }
    }
    didYouMean = suggestDidYouMean(trimmedQuery, titles);
  }

  return (
    <div className="page-shell">
      <p className="eyebrow">Search</p>
      <h1>All knowledge bases</h1>
      <form action="/search" className="kb-search" role="search">
        <label>
          <span className="meta">Search all knowledge bases</span>
          <input
            className="input"
            defaultValue={q}
            name="q"
            placeholder="Search all knowledge bases..."
            type="search"
          />
        </label>
        <label>
          <span className="meta">Tag facet</span>
          <input
            className="input"
            defaultValue={tag}
            name="tag"
            placeholder="e.g. visa"
            type="search"
          />
        </label>
        <button className="button" type="submit" style={{ alignSelf: "end" }}>
          Search
        </button>
      </form>

      {trimmedTag ? (
        <p className="meta">
          Filtering by tag <strong>{trimmedTag}</strong>
          {" · "}
          <Link href={trimmedQuery ? `/search?q=${encodeURIComponent(trimmedQuery)}` : "/search"}>Clear tag</Link>
        </p>
      ) : null}

      <h2>Results</h2>
      {rateLimited ? (
        <p className="empty">Too many searches in a short time. Please wait a moment and try again.</p>
      ) : (
        <>
          {hasSearch && results.length > 0 && (
            <p className="meta">
              {results.length} result{results.length === 1 ? "" : "s"}
              {trimmedQuery ? <> for &ldquo;{trimmedQuery}&rdquo;</> : null}
              {trimmedTag ? <> tagged &ldquo;{trimmedTag}&rdquo;</> : null}
            </p>
          )}
          {!hasSearch && <p className="empty">Enter a search term or tag to find pages and files.</p>}
          {hasSearch && results.length === 0 && (
            <p className="empty">
              No results found
              {trimmedQuery ? <> for &ldquo;{trimmedQuery}&rdquo;</> : null}
              {trimmedTag ? <> with tag &ldquo;{trimmedTag}&rdquo;</> : null}.
              {didYouMean ? (
                <>
                  {" "}
                  Did you mean{" "}
                  <Link href={`/search?q=${encodeURIComponent(didYouMean)}`}>{didYouMean}</Link>?
                </>
              ) : null}
            </p>
          )}
        </>
      )}

      <div className="search-groups">
        {groups.map((group) => (
          <section className="search-group" key={group.kbId}>
            <h3>{group.kbTitle}</h3>
            <div className="grid">
              {group.results.map(({ result, href }) => (
                <article className="card" key={`${result.type}-${result.id}`}>
                  <p className="eyebrow">{result.type === "asset" ? "File" : "Page"}</p>
                  <h4>
                    <Link href={href}>{result.title}</Link>
                  </h4>
                  <p>{result.summary}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
