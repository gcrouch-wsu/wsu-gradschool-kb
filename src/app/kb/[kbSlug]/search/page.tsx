import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCurrentAdminSession, getKbReadAccess } from "@/lib/auth";
import { getAssetById, getKbById, getKbBySlug, getVisiblePagesForKb, searchKb } from "@/lib/kb-store";
import { suggestDidYouMean } from "@/lib/search-suggest";
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
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { kbSlug } = await params;
  const { q = "", tag = "" } = await searchParams;
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
  const trimmedTag = tag.trim();
  const hasSearch = Boolean(trimmedQuery || trimmedTag);

  let rateLimited = false;
  if (hasSearch) {
    const clientKey = clientKeyFromHeaders(await headers());
    rateLimited = !(await rateLimit(`search:${clientKey}`, SEARCH_LIMIT, SEARCH_WINDOW_SECONDS)).allowed;
  }

  const results = rateLimited || !hasSearch
    ? []
    : await searchKb(kb.id, trimmedQuery, access.canReadStaffContent, {
        readableKbIds: [kb.id],
        staffKbIds: access.canReadStaffContent ? [kb.id] : [],
        tag: trimmedTag || undefined,
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
      <form className="kb-search" role="search">
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
          <span className="meta">Tag facet</span>
          <input className="input" defaultValue={tag} name="tag" placeholder="e.g. visa" type="search" />
        </label>
        <button className="button" type="submit" style={{ alignSelf: "end" }}>
          Search
        </button>
      </form>

      {trimmedTag ? (
        <p className="meta">
          Filtering by tag <strong>{trimmedTag}</strong>
          {" · "}
          <Link href={trimmedQuery ? `?q=${encodeURIComponent(trimmedQuery)}` : "?"}>Clear tag</Link>
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
          {!hasSearch && (
            <p className="empty">Enter a search term or tag to find pages and files in {kb.title}.</p>
          )}
          {hasSearch && results.length === 0 && (
            <p className="empty">
              No results found
              {trimmedQuery ? <> for &ldquo;{trimmedQuery}&rdquo;</> : null}
              {trimmedTag ? <> with tag &ldquo;{trimmedTag}&rdquo;</> : null}.
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
