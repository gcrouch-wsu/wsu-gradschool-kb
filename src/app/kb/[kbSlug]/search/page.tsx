import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/auth";
import { getAssetById, getKbById, getKbBySlug, searchKb } from "@/lib/kb-store";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";

const SEARCH_LIMIT = 30;
const SEARCH_WINDOW_SECONDS = 60;

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ kbSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { kbSlug } = await params;
  const { q = "" } = await searchParams;
  const isStaff = Boolean(await getCurrentAdminSession());
  const kb = await getKbBySlug(kbSlug, isStaff);
  if (!kb) {
    notFound();
  }


  let rateLimited = false;
  if (q.trim()) {
    const clientKey = clientKeyFromHeaders(await headers());
    rateLimited = !(await rateLimit(`search:${clientKey}`, SEARCH_LIMIT, SEARCH_WINDOW_SECONDS)).allowed;
  }

  const results = rateLimited ? [] : await searchKb(kb.id, q, isStaff);
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
        <button className="button" type="submit" style={{ alignSelf: "end" }}>
          Search
        </button>
      </form>

      <h2>Results</h2>
      {rateLimited ? (
        <p className="empty">Too many searches in a short time. Please wait a moment and try again.</p>
      ) : (
        <>
          {q.trim() && results.length > 0 && (
            <p className="meta">
              {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{q.trim()}&rdquo;
            </p>
          )}
          {!q.trim() && (
            <p className="empty">Enter a search term to find pages and files in {kb.title}.</p>
          )}
          {q.trim() && results.length === 0 && (
            <p className="empty">No results found for &ldquo;{q.trim()}&rdquo;.</p>
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
