import { mergeTheme, SAFE_FONTS, type KbTheme } from "./kb-theme";
import type { ContentBlock } from "./types";

export interface NavLink {
  label: string;
  url: string;
}

export type Alignment = "left" | "center" | "right";

export const ALIGNMENTS: Alignment[] = ["left", "center", "right"];

export const BRAND_TEXT_WEIGHTS = ["", "400", "500", "600", "700", "800", "900"] as const;
export type BrandTextWeight = (typeof BRAND_TEXT_WEIGHTS)[number];

export interface SiteSettings {
  // Branding
  brandText: string;
  brandTextColor: string; // hex; "" = inherit default
  brandTextSize: string; // e.g. "1.1rem" / "20px"; "" = default
  brandTextWeight: BrandTextWeight; // "" = default
  brandTextFont: string; // SAFE_FONTS key; "" = inherit
  logoUrl: string;
  logoWidth: number; // px; 0 = natural size
  // Layout / placement
  headerAlignment: Alignment;
  heroAlignment: Alignment;
  contentWidth: number; // px; 0 = theme default (1320)
  // Home page
  homeEyebrow: string;
  homeTitle: string;
  homeIntro: string;
  homeBlocks: ContentBlock[];
  showKbList: boolean;
  kbListTitle: string;
  kbListTitleColor: string; // hex; "" = inherit default
  kbListTitleSize: string; // e.g. "1.75rem" / "28px"; "" = default
  kbListTitleWeight: BrandTextWeight; // "" = default
  kbListTitleFont: string; // SAFE_FONTS key; "" = inherit
  // Chrome
  headerLinks: NavLink[];
  footerText: string;
  footerLinks: NavLink[];
  contactInfo: string;
  globalTheme: KbTheme | null;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brandText: "WSU Knowledge Base",
  brandTextColor: "",
  brandTextSize: "",
  brandTextWeight: "",
  brandTextFont: "",
  logoUrl: "",
  logoWidth: 0,
  headerAlignment: "left",
  heroAlignment: "left",
  contentWidth: 0,
  homeEyebrow: "WSU Knowledge Base",
  homeTitle: "Washington State University knowledge bases",
  homeIntro:
    "A single platform for Washington State University's public knowledge bases. Each knowledge base — including the Graduate School's — has its own home, navigation, search, and stable managed asset links.",
  homeBlocks: [],
  showKbList: true,
  kbListTitle: "Published knowledge bases",
  kbListTitleColor: "",
  kbListTitleSize: "",
  kbListTitleWeight: "",
  kbListTitleFont: "",
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
  brandText: 120,
  homeEyebrow: 120,
  homeTitle: 200,
  homeIntro: 1000,
  footerText: 500,
  contactInfo: 500,
};

// Numeric bounds: [min, max]. 0 is always allowed and means "unset / use default".
const NUMERIC_BOUNDS: Record<string, [number, number]> = {
  logoWidth: [16, 600],
  contentWidth: [640, 2400],
};

function normalizeLinks(raw: unknown): NavLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is { label: string; url: string } => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.label === "string" && typeof candidate.url === "string";
    })
    .map((item) => ({
      label: item.label.trim().slice(0, 100),
      url: item.url.trim().slice(0, 500),
    }));
}

function safeLogoUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  const isDataUrl = /^data:image\//i.test(raw);
  // Plain URLs/paths stay short; inline base64 data URLs (Blob-less fallback) may be large —
  // allow up to ~8M chars, which covers the 5 MB upload limit after base64 expansion.
  const maxLen = isDataUrl ? 8_000_000 : 5000;
  if (raw.length > maxLen) return "";
  // Allow absolute https/http URLs, root-relative paths, and inline data images only.
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/") || isDataUrl) {
    return raw;
  }
  return "";
}

function safeBrandColor(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw.toLowerCase() : "";
}

function safeBrandSize(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  return /^\d+(\.\d+)?(rem|px)$/i.test(raw) ? raw.toLowerCase() : "";
}

function safeBrandWeight(value: unknown): BrandTextWeight {
  return BRAND_TEXT_WEIGHTS.includes(value as BrandTextWeight) ? (value as BrandTextWeight) : "";
}

function safeBrandFont(value: unknown): string {
  return typeof value === "string" && value in SAFE_FONTS ? value : "";
}

export function normalizeSiteSettings(input: Partial<Record<keyof SiteSettings, unknown>>): SiteSettings {
  const pickText = (key: keyof SiteSettings, fallback: string) => {
    const value = input[key];
    if (value === undefined) return fallback;
    const raw = typeof value === "string" ? value : "";
    return raw.trim().slice(0, MAX_LENGTHS[key] ?? 1000);
  };

  const pickNumber = (key: keyof SiteSettings, fallback: number) => {
    const value = input[key];
    if (value === undefined || value === null || value === "") return fallback;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (n <= 0) return 0; // 0 means "unset / use default"
    const bounds = NUMERIC_BOUNDS[key];
    if (!bounds) return Math.round(n);
    return Math.round(Math.min(Math.max(n, bounds[0]), bounds[1]));
  };

  const pickAlignment = (key: keyof SiteSettings, fallback: Alignment): Alignment => {
    const value = input[key];
    return ALIGNMENTS.includes(value as Alignment) ? (value as Alignment) : fallback;
  };

  return {
    brandText: pickText("brandText", DEFAULT_SITE_SETTINGS.brandText),
    brandTextColor: safeBrandColor(input.brandTextColor),
    brandTextSize: safeBrandSize(input.brandTextSize),
    brandTextWeight: safeBrandWeight(input.brandTextWeight),
    brandTextFont: safeBrandFont(input.brandTextFont),
    logoUrl: safeLogoUrl(input.logoUrl),
    logoWidth: pickNumber("logoWidth", DEFAULT_SITE_SETTINGS.logoWidth),
    headerAlignment: pickAlignment("headerAlignment", DEFAULT_SITE_SETTINGS.headerAlignment),
    heroAlignment: pickAlignment("heroAlignment", DEFAULT_SITE_SETTINGS.heroAlignment),
    contentWidth: pickNumber("contentWidth", DEFAULT_SITE_SETTINGS.contentWidth),
    homeEyebrow: pickText("homeEyebrow", DEFAULT_SITE_SETTINGS.homeEyebrow),
    homeTitle: pickText("homeTitle", DEFAULT_SITE_SETTINGS.homeTitle),
    homeIntro: pickText("homeIntro", DEFAULT_SITE_SETTINGS.homeIntro),
    headerLinks: normalizeLinks(input.headerLinks),
    footerText: pickText("footerText", DEFAULT_SITE_SETTINGS.footerText),
    footerLinks: normalizeLinks(input.footerLinks),
    contactInfo: pickText("contactInfo", DEFAULT_SITE_SETTINGS.contactInfo),
    globalTheme: input.globalTheme ? mergeTheme(input.globalTheme) : null,
    homeBlocks: Array.isArray(input.homeBlocks) ? (input.homeBlocks as ContentBlock[]) : DEFAULT_SITE_SETTINGS.homeBlocks,
    showKbList: typeof input.showKbList === "boolean" ? input.showKbList : DEFAULT_SITE_SETTINGS.showKbList,
    kbListTitle: pickText("kbListTitle", DEFAULT_SITE_SETTINGS.kbListTitle),
    kbListTitleColor: safeBrandColor(input.kbListTitleColor),
    kbListTitleSize: safeBrandSize(input.kbListTitleSize),
    kbListTitleWeight: safeBrandWeight(input.kbListTitleWeight),
    kbListTitleFont: safeBrandFont(input.kbListTitleFont),
  };
}
