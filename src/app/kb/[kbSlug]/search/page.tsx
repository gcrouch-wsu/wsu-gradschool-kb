import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetById, getKbById, getKbBySlug, searchKb } from "@/lib/demo-data";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ kbSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { kbSlug } = await params;
  const { q = "" } = await searchParams;
  const kb = getKbBySlug(kbSlug);
  if (!kb) {
    notFound();
  }

  const results = searchKb(kb.id, q);

  return (
    <div className="page-shell">
      <p className="eyebrow">Search</p>
      <h1>{kb.title}</h1>
      <form className="form">
        <label>
          <span className="meta">Search this KB</span>
          <input className="input" defaultValue={q} name="q" type="search" />
        </label>
        <button className="button" type="submit">
          Search
        </button>
      </form>

      <h2>Results</h2>
      {!q.trim() && <p>Enter a search term.</p>}
      {q.trim() && results.length === 0 && <p>No results found.</p>}
      <div className="grid">
        {results.map((result) => {
          let href = "#";
          if (result.type === "page") {
            href = `/kb/${kb.slug}/${result.path.join("/")}`;
          } else {
            const asset = getAssetById(result.id);
            const homeKb = asset ? getKbById(asset.homeKbId) : null;
            if (asset && homeKb) {
              href = `/kb/${homeKb.slug}/files/${asset.slug}`;
            }
          }
          return (
            <article className="card" key={`${result.type}-${result.id}`}>
              <p className="eyebrow">{result.type}</p>
              <h3>
                <Link href={href}>{result.title}</Link>
              </h3>
              <p>{result.summary}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
