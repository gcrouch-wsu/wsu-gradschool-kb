"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasSiteBrand, SiteBrand, type SiteBrandSettings } from "@/components/SiteBrand";
import type { UserRole } from "@/lib/types";

type PublicChromeSettings = SiteBrandSettings & {
  headerAlignment: "left" | "center" | "right";
  headerLinks: Array<{ label: string; url: string }>;
  footerText: string;
  contactInfo: string;
  footerLinks: Array<{ label: string; url: string }>;
};

type PublicChromeSession = {
  email: string;
  role: UserRole;
} | null;

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function isAdminShellPath(pathname: string) {
  return pathname.startsWith("/admin") && !pathname.startsWith("/admin/sign-in");
}

/**
 * Public header/footer must follow the client pathname. The root layout does not
 * re-render on soft navigations, so a server-only `{!isAdminShell && …}` gate
 * strands viewers who leave admin without a full page load (no Admin link).
 */
export function PublicSiteChrome({
  session,
  settings,
}: {
  session: PublicChromeSession;
  settings: PublicChromeSettings;
}) {
  const pathname = usePathname() ?? "";
  if (isAdminShellPath(pathname)) {
    return null;
  }

  const hasBrand = hasSiteBrand(settings);
  const headerAlignClass =
    settings.headerAlignment === "center"
      ? " is-center"
      : settings.headerAlignment === "right"
        ? " is-right"
        : "";

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className={`site-header__inner${headerAlignClass}`}>
          {hasBrand && <SiteBrand href="/" settings={settings} variant="header" />}
          <nav className="nav" aria-label="Primary">
            <Link href="/">Knowledge bases</Link>
            {settings.headerLinks.map((link, i) => (
              <a key={i} href={link.url}>
                {link.label}
              </a>
            ))}
            {session?.role !== "viewer" && (
              // Plain anchor: entering the admin shell needs a full page load.
              <a href={session ? "/admin" : "/admin/sign-in?next=%2Fadmin"}>Admin</a>
            )}
            {session && (
              <span className="nav-user" title={`Signed in as ${session.email}`}>
                <span className="nav-user__name">{session.email}</span>
                <span className="nav-user__role">{roleLabel(session.role)}</span>
              </span>
            )}
            {session && (
              <form action="/api/admin/logout" className="nav-signout" method="post">
                <button className="nav-signout__button" type="submit">
                  Sign out
                </button>
              </form>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}

export function PublicSiteFooter({ settings }: { settings: PublicChromeSettings }) {
  const pathname = usePathname() ?? "";
  if (isAdminShellPath(pathname)) {
    return null;
  }

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="footer-brand">
          {settings.footerText && <p className="meta">{settings.footerText}</p>}
          {settings.contactInfo && <p className="meta">{settings.contactInfo}</p>}
        </div>
        {settings.footerLinks.length > 0 && (
          <nav className="footer-nav" aria-label="Footer">
            {settings.footerLinks.map((link, i) => (
              <a key={i} href={link.url}>
                {link.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </footer>
  );
}
