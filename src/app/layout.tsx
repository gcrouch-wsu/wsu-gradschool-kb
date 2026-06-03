import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "WSU Knowledge Base",
  description:
    "Washington State University knowledge base platform. Browse published knowledge bases, including the Graduate School knowledge base.",
};

// The per-request CSP nonce (set in src/proxy.ts) can only be attached to inline
// scripts during request-time rendering, so the app must not be statically prerendered.
export const dynamic = "force-dynamic";

const currentYear = new Date().getFullYear();

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
              <Link href="/kb/graduate-school">Graduate School</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="site-footer__inner">
            <div>
              <div className="site-footer__brand">Washington State University Knowledge Base</div>
              <p className="meta">Public procedures, guidance, and managed resources for WSU partners.</p>
            </div>
            <nav aria-label="Footer">
              <Link href="/">Knowledge bases</Link>
              <Link href="/kb/graduate-school">Graduate School</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </div>
          <div className="site-footer__inner" style={{ paddingTop: 0 }}>
            <p className="meta">© {currentYear} Washington State University</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
