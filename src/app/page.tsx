import Link from "next/link";
import { getPublishedKbs } from "@/lib/kb-store";
import { formatDate } from "@/lib/format";

export default async function HomePage() {
  const kbs = await getPublishedKbs();

  return (
    <>
      <section className="hero">
        <div className="site-header__inner">
          <div>
            <p className="eyebrow">WSU Knowledge Base</p>
            <h1>Washington State University knowledge bases</h1>
            <p className="lead">
              A single platform for Washington State University&apos;s public knowledge bases. Each knowledge
              base — including the Graduate School&apos;s — has its own home, navigation, search, and stable
              managed asset links.
            </p>
          </div>
        </div>
      </section>
      <div className="page-shell">
        <h2>Published knowledge bases</h2>
        {kbs.length === 0 && (
          <div className="empty">
            <svg
              aria-hidden="true"
              fill="none"
              height="48"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
              width="48"
              xmlns="http://www.w3.org/2000/svg"
              style={{ margin: "0 auto" }}
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            <p>No knowledge bases are published yet. Check back soon for guides and resources.</p>
          </div>
        )}
        <div className="grid grid--two">
          {kbs.map((kb) => (
            <article className="card" key={kb.id}>
              <h3>
                <Link href={`/kb/${kb.slug}`}>{kb.title}</Link>
              </h3>
              <p>{kb.description}</p>
              <p className="meta">Updated on {formatDate(kb.updatedOn)}</p>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
