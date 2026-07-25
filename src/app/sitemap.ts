import type { MetadataRoute } from "next";
import { getPublishedKbs, getVisiblePagesForKb } from "@/lib/kb-store";

function siteOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

/** Public published KB landings + public published pages only (never private/staff/draft). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const entries: MetadataRoute.Sitemap = [{ url: origin, changeFrequency: "weekly", priority: 1 }];

  const kbs = (await getPublishedKbs()).filter((kb) => kb.visibility === "public");
  for (const kb of kbs) {
    entries.push({
      url: `${origin}/kb/${kb.slug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    });
    const pages = await getVisiblePagesForKb(kb.id, false);
    for (const page of pages) {
      if ((page.nodeKind ?? "page") !== "page") continue;
      if (page.visibility === "staff") continue;
      if (kb.homepagePageId === page.id) continue;
      entries.push({
        url: `${origin}/kb/${kb.slug}/${page.path.join("/")}`,
        changeFrequency: "weekly",
        priority: 0.6,
        lastModified: page.updatedDisplayDate || undefined,
      });
    }
  }

  return entries;
}
