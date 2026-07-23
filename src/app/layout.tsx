import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import { AdminAppClassSync } from "@/components/AdminAppClassSync";
import { PublicSiteChrome, PublicSiteFooter } from "@/components/PublicSiteChrome";
import { getCurrentAdminSession } from "@/lib/auth";
import { loadSiteSettings } from "@/lib/db";
import { DEFAULT_THEME, mergeTheme, themeToCssVars } from "@/lib/kb-theme";
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

  const [session, settings] = await Promise.all([getCurrentAdminSession(), loadSiteSettings()]);

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
