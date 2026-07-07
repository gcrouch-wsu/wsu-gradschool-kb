"use client";

import { RouteErrorPage } from "@/components/route-states/RouteErrorPage";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html className="kb-theme-root" lang="en">
      <body>
        <main id="main">
          <RouteErrorPage error={error} reset={reset} variant="public" />
        </main>
      </body>
    </html>
  );
}
