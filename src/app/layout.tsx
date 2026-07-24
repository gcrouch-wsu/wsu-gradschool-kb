import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import { AdminAppClassSync } from "@/components/AdminAppClassSync";
import { PublicSiteChrome, PublicSiteFooter } from "@/components/PublicSiteChrome";
import { getCurrentAdminSession } from "@/lib/auth";
import { loadSiteSettings } from "@/lib/db";
import { DEFAULT_THEME, mergeTheme, themeToCssVars } from "@/lib/kb-theme";
import { logError } from "@/lib/log";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";
import "./globals.css";

export const metadata: Metadata = {
  title: "WSU Knowledge Base",
  description:
    "Washington State University knowledge base platform. Browse published knowledge bases, including the Graduate School knowledge base.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isAdminShell = pathname.startsWith("/admin") && !pathname.startsWith("/admin/sign-in");

  // getCurrentAdminSession() already fails closed internally on a transient DB hiccup (see
  // src/lib/auth.ts). loadSiteSettings() has no such guard, and a failure here must not take
  // down the whole root layout either — that would drop to global-error.tsx, which renders with
  // no header at all and strands a signed-in owner/admin/editor with no way back to /admin.
  const [session, settings] = await Promise.all([
    getCurrentAdminSession(),
    loadSiteSettings().catch((error: unknown) => {
      logError(error, { route: "RootLayout", surface: "loadSiteSettings" });
      return DEFAULT_SITE_SETTINGS;
    }),
  ]);

  const globalTheme = mergeTheme(settings.globalTheme || DEFAULT_THEME);
  const themeVars: CSSProperties = {
    ...(themeToCssVars(globalTheme) as CSSProperties),
    ...(settings.contentWidth ? { "--content-width": `${settings.contentWidth}px` } : {}),
  };

  const chromeSettings = {
    logoUrl: settings.logoUrl,
    logoWidth: settings.logoWidth,
    brandText: settings.brandText,
    brandTextColor: settings.brandTextColor,
    brandTextSize: settings.brandTextSize,
    brandTextWeight: settings.brandTextWeight,
    brandTextFont: settings.brandTextFont,
    headerAlignment: settings.headerAlignment,
    headerLinks: settings.headerLinks,
    footerText: settings.footerText,
    contactInfo: settings.contactInfo,
    footerLinks: settings.footerLinks,
  };

  const chromeSession = session ? { email: session.email, role: session.role } : null;

  return (
    <html className={`kb-theme-root${isAdminShell ? " admin-app" : ""}`} lang="en" style={themeVars}>
      <body className={isAdminShell ? "admin-app-body" : undefined}>
        <AdminAppClassSync />
        <PublicSiteChrome session={chromeSession} settings={chromeSettings} />
        <main className={isAdminShell ? "admin-app-main" : undefined} id="main">
          {children}
        </main>
        <PublicSiteFooter settings={chromeSettings} />
      </body>
    </html>
  );
}
