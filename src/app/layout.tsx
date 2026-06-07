import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { getCurrentAdminSession } from "@/lib/auth";
import { loadSiteSettings } from "@/lib/db";
import { DEFAULT_THEME, fontStack, themeToCssVars } from "@/lib/kb-theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "WSU Knowledge Base",
  description:
    "Washington State University knowledge base platform. Browse published knowledge bases, including the Graduate School knowledge base.",
};

export const dynamic = "force-dynamic";

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, settings] = await Promise.all([getCurrentAdminSession(), loadSiteSettings()]);

  const globalTheme = settings.globalTheme || DEFAULT_THEME;
  const themeVars: CSSProperties = {
    ...(themeToCssVars(globalTheme) as CSSProperties),
    ...(settings.contentWidth ? { "--content-width": `${settings.contentWidth}px` } : {}),
  };

  const hasBrand = Boolean(settings.logoUrl || settings.brandText);
  const brandTextStyle: CSSProperties = {
    ...(settings.brandTextColor ? { color: settings.brandTextColor } : {}),
    ...(settings.brandTextSize ? { fontSize: settings.brandTextSize } : {}),
    ...(settings.brandTextWeight ? { fontWeight: Number(settings.brandTextWeight) } : {}),
    ...(settings.brandTextFont ? { fontFamily: fontStack(settings.brandTextFont) } : {}),
  };
  const headerAlignClass =
    settings.headerAlignment === "center"
      ? " is-center"
      : settings.headerAlignment === "right"
        ? " is-right"
        : "";

  return (
    <html className="kb-theme-root" lang="en" style={themeVars}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className={`site-header__inner${headerAlignClass}`}>
            {hasBrand && (
              <Link className={`brand${settings.logoUrl ? " brand--has-logo" : ""}`} href="/">
                {settings.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={settings.brandText || "Home"}
                    className="brand__logo"
                    src={settings.logoUrl}
                    style={settings.logoWidth ? { width: `${settings.logoWidth}px`, maxHeight: "none" } : undefined}
                  />
                )}
                {settings.brandText && (
                  <span className="brand__text" style={brandTextStyle}>
                    {settings.brandText}
                  </span>
                )}
              </Link>
            )}
            <nav className="nav" aria-label="Primary">
              <Link href="/">Knowledge bases</Link>
              {settings.headerLinks.map((link, i) => (
                <a key={i} href={link.url}>
                  {link.label}
                </a>
              ))}
              <Link href="/admin">Admin</Link>
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
        <main id="main">{children}</main>
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
      </body>
    </html>
  );
}
