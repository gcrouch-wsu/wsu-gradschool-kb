import { mergeTheme, type KbTheme } from "./kb-theme";

export interface NavLink {
  label: string;
  url: string;
}

export interface SiteSettings {
  homeEyebrow: string;
  homeTitle: string;
  homeIntro: string;
  headerLinks: NavLink[];
  footerText: string;
  footerLinks: NavLink[];
  contactInfo: string;
  globalTheme: KbTheme | null;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  homeEyebrow: "WSU Knowledge Base",
  homeTitle: "Washington State University knowledge bases",
  homeIntro:
    "A single platform for Washington State University's public knowledge bases. Each knowledge base — including the Graduate School's — has its own home, navigation, search, and stable managed asset links.",
  headerLinks: [],
  footerText: "© Washington State University Graduate School",
  footerLinks: [
    { label: "WSU Home", url: "https://wsu.edu" },
    { label: "Graduate School", url: "https://gradschool.wsu.edu" },
  ],
  contactInfo: "Contact us: gradschool@wsu.edu",
  globalTheme: null,
};

const MAX_LENGTHS: Record<string, number> = {
  homeEyebrow: 120,
  homeTitle: 200,
  homeIntro: 1000,
  footerText: 500,
  contactInfo: 500,
};

function normalizeLinks(raw: unknown): NavLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is { label: string; url: string } => {
      return (
        item &&
        typeof item === "object" &&
        typeof (item as any).label === "string" &&
        typeof (item as any).url === "string"
      );
    })
    .map((item) => ({
      label: item.label.trim().slice(0, 100),
      url: item.url.trim().slice(0, 500),
    }));
}

export function normalizeSiteSettings(input: Partial<Record<keyof SiteSettings, unknown>>): SiteSettings {
  const pickText = (key: keyof SiteSettings, fallback: string) => {
    const value = input[key];
    if (value === undefined) return fallback;
    const raw = typeof value === "string" ? value : "";
    return raw.trim().slice(0, MAX_LENGTHS[key] ?? 1000);
  };

  return {
    homeEyebrow: pickText("homeEyebrow", DEFAULT_SITE_SETTINGS.homeEyebrow),
    homeTitle: pickText("homeTitle", DEFAULT_SITE_SETTINGS.homeTitle),
    homeIntro: pickText("homeIntro", DEFAULT_SITE_SETTINGS.homeIntro),
    headerLinks: normalizeLinks(input.headerLinks),
    footerText: pickText("footerText", DEFAULT_SITE_SETTINGS.footerText),
    footerLinks: normalizeLinks(input.footerLinks),
    contactInfo: pickText("contactInfo", DEFAULT_SITE_SETTINGS.contactInfo),
    globalTheme: input.globalTheme ? mergeTheme(input.globalTheme) : null,
  };
}
