import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { accessibleKbIds, filterKbsForReadAccess, getCurrentAdminSession } from "@/lib/auth";
import {
  getAssetById,
  getAllKbsForAdmin,
  getKbById,
  getPublishedKbs,
  searchKb,
  type SearchKbOptions,
  type SearchResult,
} from "@/lib/kb-store";
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

async function searchScope(): Promise<{ includeStaff: boolean; options: SearchKbOptions }> {
  const session = await getCurrentAdminSession();
  const sourceKbs = session ? await getAllKbsForAdmin() : await getPublishedKbs();
  const readableKbIds = (await filterKbsForReadAccess(session, sourceKbs)).map((kb) => kb.id);
  if (!session) {
    return { includeStaff: false, options: { readableKbIds, staffKbIds: [] } };
  }
  if (session.role === "owner" || session.role === "admin") {
    return { includeStaff: true, options: { includeAllKbs: true, staffKbIds: null } };
  }
  if (session.role === "editor") {
    const assigned = (await accessibleKbIds(session)) ?? [];
    return { includeStaff: true, options: { readableKbIds, staffKbIds: assigned } };
  }
  if (session.role === "viewer") {
    return { includeStaff: false, options: { readableKbIds, staffKbIds: [] } };
  }
  return { includeStaff: false, options: { readableKbIds, staffKbIds: [] } };
}

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
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const trimmedQuery = q.trim();

  let rateLimited = false;
  if (trimmedQuery) {
    const clientKey = clientKeyFromHeaders(await headers());
    rateLimited = !(await rateLimit(`search:${clientKey}`, SEARCH_LIMIT, SEARCH_WINDOW_SECONDS)).allowed;
  }

  const scope = await searchScope();
  const results = rateLimited || !trimmedQuery
    ? []
    : await searchKb(undefined, q, scope.includeStaff, scope.options);
  const groups = await resolveResults(results);

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
        <button className="button" type="submit" style={{ alignSelf: "end" }}>
          Search
        </button>
      </form>

      <h2>Results</h2>
      {rateLimited ? (
        <p className="empty">Too many searches in a short time. Please wait a moment and try again.</p>
      ) : (
        <>
          {trimmedQuery && results.length > 0 && (
            <p className="meta">
              {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{trimmedQuery}&rdquo;
            </p>
          )}
          {!trimmedQuery && <p className="empty">Enter a search term to find pages and files.</p>}
          {trimmedQuery && results.length === 0 && (
            <p className="empty">No results found for &ldquo;{trimmedQuery}&rdquo;.</p>
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
