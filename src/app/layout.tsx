import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentAdminSession } from "@/lib/auth";
import { loadSiteSettings } from "@/lib/db";
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

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="site-header__inner">
            <Link className="brand" href="/">
              WSU Knowledge Base
            </Link>
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
              <p className="meta">{settings.footerText}</p>
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
