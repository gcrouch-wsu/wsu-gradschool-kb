import Link from "next/link";
import { notFound } from "next/navigation";
import { getKbBySlug, getPublishedPagesForKb } from "@/lib/demo-data";
import { formatDate } from "@/lib/format";

export default async function KbHomePage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = getKbBySlug(kbSlug);
  if (!kb) {
    notFound();
  }

  const pages = getPublishedPagesForKb(kb.id);

  return (
    <>
      <section className="hero">
        <div className="site-header__inner">
          <div>
            <p className="eyebrow">Knowledge base</p>
            <h1>{kb.title}</h1>
            <p className="lead">{kb.description}</p>
            <form action={`/kb/${kb.slug}/search`} className="form">
              <label>
                <span className="meta">Search this KB</span>
                <input className="input" name="q" type="search" />
              </label>
            </form>
          </div>
        </div>
      </section>
      <div className="page-shell">
        <h2>Published Pages</h2>
        <div className="grid grid--two">
          {pages.map((page) => (
            <article className="card" key={page.id}>
              <h3>
                <Link href={`/kb/${kb.slug}/${page.path.join("/")}`}>{page.title}</Link>
              </h3>
              <p>{page.summary}</p>
              <p className="meta">Updated on {formatDate(page.updatedDisplayDate)}</p>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
