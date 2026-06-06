/** Platform-level site settings (owner-editable). Currently the public home hero copy. */

export interface SiteSettings {
  homeEyebrow: string;
  homeTitle: string;
  homeIntro: string;
}

/** Fallback used before anything is saved and whenever no database is configured. */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  homeEyebrow: "WSU Knowledge Base",
  homeTitle: "Washington State University knowledge bases",
  homeIntro:
    "A single platform for Washington State University's public knowledge bases. Each knowledge base — including the Graduate School's — has its own home, navigation, search, and stable managed asset links.",
};

const MAX_LENGTHS: Record<keyof SiteSettings, number> = {
  homeEyebrow: 120,
  homeTitle: 200,
  homeIntro: 1000,
};

/** Coerce arbitrary input into valid SiteSettings, trimming and length-capping each field. */
export function normalizeSiteSettings(input: Partial<Record<keyof SiteSettings, unknown>>): SiteSettings {
  const pick = (key: keyof SiteSettings) => {
    const raw = typeof input[key] === "string" ? (input[key] as string) : "";
    const trimmed = raw.trim().slice(0, MAX_LENGTHS[key]);
    return trimmed || DEFAULT_SITE_SETTINGS[key];
  };
  return {
    homeEyebrow: pick("homeEyebrow"),
    homeTitle: pick("homeTitle"),
    homeIntro: pick("homeIntro"),
  };
}
