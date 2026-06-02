import Link from "next/link";
import { getPublishedKbs } from "@/lib/demo-data";
import { formatDate } from "@/lib/format";

export default function HomePage() {
  const kbs = getPublishedKbs();

  return (
    <>
      <section className="hero">
        <div className="site-header__inner">
          <div>
            <p className="eyebrow">Knowledge bases</p>
            <h1>Public Graduate School guidance</h1>
            <p className="lead">
              Browse published knowledge bases with stable managed asset links and accessible page layouts.
            </p>
          </div>
        </div>
      </section>
      <div className="page-shell">
        <div className="grid grid--two">
          {kbs.map((kb) => (
            <article className="card" key={kb.id}>
              <h2>
                <Link href={`/kb/${kb.slug}`}>{kb.title}</Link>
              </h2>
              <p>{kb.description}</p>
              <p className="meta">Updated on {formatDate(kb.updatedOn)}</p>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
