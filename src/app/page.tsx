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
