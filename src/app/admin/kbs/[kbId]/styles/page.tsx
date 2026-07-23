import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ThemeEditor } from "@/components/ThemeEditor";
import { getCurrentAdminSession } from "@/lib/auth";
import { isDatabaseEnabled, loadSiteSettings } from "@/lib/db";
import { getKbById } from "@/lib/kb-store";
import { DEFAULT_THEME, mergeTheme, withGlobalPageTreeChrome } from "@/lib/kb-theme";

export default async function ManageStylesPage({ params }: { params: Promise<{ kbId: string }> }) {
  const session = await getCurrentAdminSession();
  if (!session) {
    redirect("/admin/sign-in");
  }

  const { kbId } = await params;

  if (session.role !== "owner") {
    return (
      <div className="page-shell">
        <p className="alert alert--error">
          Manage Styles is restricted to <strong>Owners</strong>. Ask an owner to adjust this KB&apos;s theme.
        </p>
        <Link className="button button--ghost" href="/admin/kbs">
          Back to knowledge bases
        </Link>
      </div>
    );
  }

  const kb = await getKbById(kbId);
  if (!kb) {
    notFound();
  }

  const settings = await loadSiteSettings();
  const globalTheme = mergeTheme(settings.globalTheme || DEFAULT_THEME);
  const theme = withGlobalPageTreeChrome(
    kb.theme ? mergeTheme(kb.theme, globalTheme) : globalTheme,
    globalTheme,
  );

  return (
    <div className="page-shell">
      <p className="eyebrow">
        <Link href="/admin/kbs">Knowledge bases</Link> · Manage styles
      </p>
      <h1>Manage Styles — {kb.title}</h1>
      <p className="lead">
        Adjust the brand colors, fonts, and type scale for this knowledge base. Changes apply to every public
        page in <code>/kb/{kb.slug}</code> once saved. Page tree width and type size are set site-wide under
        Site Settings → Global Styling; use the collapsible option below if this KB&apos;s tree is deep.
      </p>
      <ThemeEditor
        dbEnabled={isDatabaseEnabled()}
        initialTheme={theme}
        kbTitle={kb.title}
        scope="kb"
        siteContentWidth={settings.contentWidth}
        onSave={async (newTheme) => {
          const toSave = withGlobalPageTreeChrome(newTheme, globalTheme);
          const res = await fetch(`/api/admin/kbs/${kb.id}/theme`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme: toSave }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || "Failed to save styles");
          }
        }}
      />
    </div>
  );
}
