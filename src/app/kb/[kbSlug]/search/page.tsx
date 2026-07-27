import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCurrentAdminSession, getKbReadAccess } from "@/lib/auth";
import { getAssetById, getKbById, getKbBySlug, getVisiblePagesForKb, searchKb } from "@/lib/kb-store";
import { getPopularSearchTags } from "@/lib/popular-search-tags";
import { suggestDidYouMean } from "@/lib/search-suggest";
import { parseSearchTagFacets } from "@/lib/search-tags";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";

const SEARCH_LIMIT = 30;
const SEARCH_WINDOW_SECONDS = 60;

export async function generateMetadata({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const session = await getCurrentAdminSession();
  const kb = await getKbBySlug(kbSlug, Boolean(session));
  if (!kb) {
    notFound();
  }
  const access = await getKbReadAccess(session, kb);
  if (!access.canRead) {
    notFound();
  }
  return { title: `Search · ${kb.title}` };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ kbSlug: string }>;
  searchParams: Promise<{ q?: string; tag?: string | string[] }>;
}) {
  const { kbSlug } = await params;
  const queryParams = await searchParams;
  const q = queryParams.q ?? "";
  const tagFacets = parseSearchTagFacets(queryParams.tag);
  const session = await getCurrentAdminSession();
  const kb = await getKbBySlug(kbSlug, Boolean(session));
  if (!kb) {
    notFound();
  }
  const access = await getKbReadAccess(session, kb);
  if (!access.canRead) {
    notFound();
  }

  const trimmedQuery = q.trim();
  const hasSearch = Boolean(trimmedQuery || tagFacets.length > 0);

  let rateLimited = false;
  if (hasSearch) {
    const clientKey = clientKeyFromHeaders(await headers());
    rateLimited = !(await rateLimit(`search:${clientKey}`, SEARCH_LIMIT, SEARCH_WINDOW_SECONDS)).allowed;
  }

  const popularTags =
    !hasSearch && !rateLimited
      ? await getPopularSearchTags([kb.id], access.canReadStaffContent)
      : [];
  const results = rateLimited || !hasSearch
    ? []
    : await searchKb(kb.id, trimmedQuery, access.canReadStaffContent, {
        readableKbIds: [kb.id],
        staffKbIds: access.canReadStaffContent ? [kb.id] : [],
        tags: tagFacets,
      });
  const resultsWithHref = await Promise.all(
    results.map(async (result) => {
      if (result.type === "page") {
        return { result, href: `/kb/${kb.slug}/${result.path.join("/")}` };
      }
      const asset = await getAssetById(result.id);
      const homeKb = asset ? await getKbById(asset.homeKbId) : null;
      return {
        result,
        href: asset && homeKb ? `/kb/${homeKb.slug}/files/${asset.slug}` : "#",
      };
    }),
  );

  let didYouMean: string | null = null;
  if (!rateLimited && trimmedQuery && results.length === 0) {
    const titles = (await getVisiblePagesForKb(kb.id, access.canReadStaffContent)).map((page) => page.title);
    didYouMean = suggestDidYouMean(trimmedQuery, titles);
  }

  return (
    <div className="page-shell">
      <p className="eyebrow">Search</p>
      <h1>{kb.title}</h1>
      <form action={`/kb/${kb.slug}/search`} className="kb-search" role="search">
        <label>
          <span className="meta">Search this knowledge base</span>
          <input
            className="input"
            defaultValue={q}
            name="q"
            placeholder={`Search ${kb.title}…`}
            type="search"
          />
        </label>
        <label>
          <span className="meta">Tag facets (comma-separated)</span>
          <input
            className="input"
            defaultValue={tagFacets.join(", ")}
            name="tag"
            placeholder="e.g. visa, deadlines"
            type="search"
          />
        </label>
        <button className="button" type="submit" style={{ alignSelf: "end" }}>
          Search
        </button>
      </form>

      {popularTags.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="meta">Popular tags in this KB</p>
          <div className="tag-list">
            {popularTags.map(({ tag, count }) => {
              const nextParams = new URLSearchParams();
              if (trimmedQuery) {
                nextParams.set("q", trimmedQuery);
              }
              for (const activeTag of tagFacets) {
                nextParams.append("tag", activeTag);
              }
              if (!tagFacets.includes(tag)) {
                nextParams.append("tag", tag);
              }
              return (
                <Link href={`/kb/${kb.slug}/search?${nextParams.toString()}`} key={tag}>
                  {tag} ({count})
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {tagFacets.length > 0 ? (
        <div className="tag-list" style={{ marginTop: "1rem" }}>
          {tagFacets.map((tag) => {
            const nextParams = new URLSearchParams();
            if (trimmedQuery) {
              nextParams.set("q", trimmedQuery);
            }
            for (const activeTag of tagFacets.filter((value) => value !== tag)) {
              nextParams.append("tag", activeTag);
            }
            return (
              <Link href={`/kb/${kb.slug}/search?${nextParams.toString()}`} key={tag}>
                {tag} ×
              </Link>
            );
          })}
        </div>
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
              {tagFacets.length > 0 ? <> tagged {tagFacets.join(" + ")}</> : null}
            </p>
          )}
          {!hasSearch && (
            <p className="empty">Enter a search term or tag to find pages and files in {kb.title}.</p>
          )}
          {hasSearch && results.length === 0 && (
            <p className="empty">
              No results found
              {trimmedQuery ? <> for &ldquo;{trimmedQuery}&rdquo;</> : null}
              {tagFacets.length > 0 ? <> with tags {tagFacets.join(", ")}</> : null}.
              {didYouMean ? (
                <>
                  {" "}
                  Did you mean{" "}
                  <Link href={`?q=${encodeURIComponent(didYouMean)}`}>{didYouMean}</Link>?
                </>
              ) : null}
            </p>
          )}
        </>
      )}
      <div className="grid">
        {resultsWithHref.map(({ result, href }) => (
          <article className="card" key={`${result.type}-${result.id}`}>
            <p className="eyebrow">{result.type === "asset" ? "File" : "Page"}</p>
            <h3>
              <Link href={href}>{result.title}</Link>
            </h3>
            <p>{result.summary}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
