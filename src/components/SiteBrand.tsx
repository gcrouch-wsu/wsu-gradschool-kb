import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { fontStack } from "@/lib/kb-theme";
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from "@/lib/site-settings";

export type SiteBrandVariant = "header" | "sidebar";

export type SiteBrandSettings = Pick<
  SiteSettings,
  | "logoUrl"
  | "logoWidth"
  | "brandText"
  | "brandTextColor"
  | "brandTextSize"
  | "brandTextWeight"
  | "brandTextFont"
>;

interface SiteBrandProps {
  href?: string;
  settings: SiteBrandSettings;
  variant?: SiteBrandVariant;
}

function brandTextStyle(settings: SiteBrandSettings): CSSProperties {
  return {
    ...(settings.brandTextColor ? { color: settings.brandTextColor } : {}),
    ...(settings.brandTextSize ? { fontSize: settings.brandTextSize } : {}),
    ...(settings.brandTextWeight ? { fontWeight: Number(settings.brandTextWeight) } : {}),
    ...(settings.brandTextFont ? { fontFamily: fontStack(settings.brandTextFont) } : {}),
  };
}

function logoStyle(settings: SiteBrandSettings, variant: SiteBrandVariant): CSSProperties | undefined {
  if (variant === "sidebar") {
    if (!settings.logoWidth) {
      return undefined;
    }

    return {
      width: `${settings.logoWidth}px`,
      maxWidth: "100%",
      height: "auto",
      maxHeight: "var(--admin-topbar-height, 60px)",
    };
  }

  if (!settings.logoWidth) {
    return undefined;
  }

  return { width: `${settings.logoWidth}px`, maxHeight: "none" };
}

function BrandLogo({
  alt,
  className,
  settings,
  variant,
}: {
  alt: string;
  className: string;
  settings: SiteBrandSettings;
  variant: SiteBrandVariant;
}) {
  if (!settings.logoUrl) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      src={settings.logoUrl}
      style={logoStyle(settings, variant)}
    />
  );
}

function wrapLink(href: string | undefined, className: string, children: ReactNode) {
  if (!href) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

export function SiteBrand({ href = "/", settings, variant = "header" }: SiteBrandProps) {
  const hasLogo = Boolean(settings.logoUrl);
  const fallbackText = settings.brandText?.trim() || DEFAULT_SITE_SETTINGS.brandText;
  const displayText = hasLogo ? "" : fallbackText;
  const alt = settings.brandText?.trim() || "Home";

  if (!hasLogo && !displayText) {
    return null;
  }

  if (variant === "sidebar") {
    return wrapLink(
      href,
      `admin-shell__brand${hasLogo ? " admin-shell__brand--logo" : ""}${hasLogo && settings.logoWidth ? " admin-shell__brand--logo-sized" : ""}`,
      hasLogo ? (
        <BrandLogo alt={alt} className="admin-shell__brand-logo" settings={settings} variant={variant} />
      ) : (
        <>
          <span aria-hidden className="admin-shell__brand-mark" />
          <span className="admin-shell__brand-text">{displayText}</span>
        </>
      ),
    );
  }

  return wrapLink(
    href,
    `brand${hasLogo ? " brand--has-logo" : ""}`,
    <>
      {hasLogo && <BrandLogo alt={alt} className="brand__logo" settings={settings} variant={variant} />}
      {displayText && (
        <span className="brand__text" style={brandTextStyle(settings)}>
          {displayText}
        </span>
      )}
    </>,
  );
}

export function hasSiteBrand(settings: SiteBrandSettings) {
  return Boolean(settings.logoUrl || settings.brandText?.trim() || DEFAULT_SITE_SETTINGS.brandText);
}
