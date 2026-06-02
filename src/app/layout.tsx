import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "WSU Graduate School Knowledge Base",
  description: "Public knowledge base prototype for Graduate School guidance and managed assets.",
};

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
              WSU Graduate School KB
            </Link>
            <nav className="nav" aria-label="Primary">
              <Link href="/">Knowledge bases</Link>
              <Link href="/kb/graduate-school">Graduate School</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
