export interface ThemeColors {
  ink: string; 
  h1: string; 
  h2: string; 
  h3: string; 
  accent: string; 
  muted: string; 
  line: string; 
  paper: string; 
  wash: string; 
  infoBoxBg: string; 
  infoBoxBorder: string; 
  infoBoxInk: string; 
  procedureBg: string; 
  procedureBorder: string; 
  procedureInk: string; 
}

export interface ThemeFonts {
  body: string; 
  heading: string; 
}

export interface ThemeScale {
  base: string; 
  h1: string; 
  h2: string; 
  h3: string; 
}

export interface ThemeOption {
  label: string;
  value: string;
}

export interface ThemeEditorAllowlist {
  fonts: ThemeOption[]; 
  sizes: ThemeOption[]; 
  colors: ThemeOption[]; 
}

export interface KbTheme {
  colors: ThemeColors;
  fonts: ThemeFonts;
  scale: ThemeScale;
  editor: ThemeEditorAllowlist;
}

export const SAFE_FONTS: Record<string, { label: string; stack: string }> = {
  system: {
    label: "System sans",
    stack: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif',
  },
  arial: { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  verdana: { label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  tahoma: { label: "Tahoma", stack: "Tahoma, Geneva, sans-serif" },
  georgia: { label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  times: { label: "Times New Roman", stack: '"Times New Roman", Times, serif' },
  palatino: { label: "Palatino", stack: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  mono: { label: "Monospace", stack: 'ui-monospace, "Cascadia Code", "Courier New", monospace' },
};

export function fontStack(key: string): string {
  return SAFE_FONTS[key]?.stack ?? SAFE_FONTS.system.stack;
}

export const DEFAULT_THEME: KbTheme = {
  colors: {
    ink: "#1d1a1b",
    h1: "#1d1a1b",
    h2: "#1d1a1b",
    h3: "#1d1a1b",
    accent: "#a60f2d",
    muted: "#6b6466",
    line: "#e4ddd8",
    paper: "#ffffff",
    wash: "#f6f3f0",
    infoBoxBg: "#f6f3f0",
    infoBoxBorder: "#a60f2d",
    infoBoxInk: "#1d1a1b",
    procedureBg: "#ffffff",
    procedureBorder: "#e4ddd8",
    procedureInk: "#1d1a1b",
  },
  fonts: { body: "system", heading: "system" },
  scale: { base: "1rem", h1: "3.5rem", h2: "1.75rem", h3: "1.4rem" },
  editor: {
    fonts: [
      { label: "Default", value: "" },
      { label: "Arial", value: "arial" },
      { label: "Georgia", value: "georgia" },
      { label: "Times New Roman", value: "times" },
      { label: "Verdana", value: "verdana" },
    ],
    sizes: [
      { label: "Default", value: "" },
      { label: "Small", value: "0.875rem" },
      { label: "Normal", value: "1rem" },
      { label: "Large", value: "1.125rem" },
      { label: "X-Large", value: "1.375rem" },
    ],
    colors: [
      { label: "Default", value: "" },
      { label: "Crimson", value: "#a60f2d" },
      { label: "Gray", value: "#5e6a71" },
      { label: "Black", value: "#000000" },
    ],
  },
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const REM = /^\d+(\.\d+)?rem$/;

function safeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !HEX.test(value.trim())) {
    return fallback;
  }
  const hex = value.trim().toLowerCase().replace("#", "");

  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return `#${full}`;
}

function safeRem(value: unknown, fallback: string): string {
  return typeof value === "string" && REM.test(value.trim()) ? value.trim() : fallback;
}

function safeFontKey(value: unknown, fallback: string): string {
  return typeof value === "string" && SAFE_FONTS[value] ? value : fallback;
}

function safeOptions(value: unknown, kind: "font" | "size" | "color", fallback: ThemeOption[]): ThemeOption[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const cleaned: ThemeOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = typeof (item as ThemeOption).label === "string" ? (item as ThemeOption).label.slice(0, 40) : "";
    const raw = (item as ThemeOption).value;
    if (!label) continue;
    let v = "";
    if (raw === "" || raw == null) v = "";
    else if (kind === "color") v = safeHex(raw, "");
    else if (kind === "size") v = safeRem(raw, "");
    else v = safeFontKey(raw, "");
    cleaned.push({ label, value: v });
  }
  return cleaned.length > 0 ? cleaned.slice(0, 12) : fallback;
}

export function mergeTheme(input: unknown): KbTheme {
  const t = (input ?? {}) as Partial<KbTheme>;
  const c = (t.colors ?? {}) as Partial<ThemeColors>;
  const f = (t.fonts ?? {}) as Partial<ThemeFonts>;
  const s = (t.scale ?? {}) as Partial<ThemeScale>;
  const e = (t.editor ?? {}) as Partial<ThemeEditorAllowlist>;
  return {
    colors: {
      ink: safeHex(c.ink, DEFAULT_THEME.colors.ink),
      h1: safeHex(c.h1, DEFAULT_THEME.colors.h1),
      h2: safeHex(c.h2, DEFAULT_THEME.colors.h2),
      h3: safeHex(c.h3, DEFAULT_THEME.colors.h3),
      accent: safeHex(c.accent, DEFAULT_THEME.colors.accent),
      muted: safeHex(c.muted, DEFAULT_THEME.colors.muted),
      line: safeHex(c.line, DEFAULT_THEME.colors.line),
      paper: safeHex(c.paper, DEFAULT_THEME.colors.paper),
      wash: safeHex(c.wash, DEFAULT_THEME.colors.wash),
      infoBoxBg: safeHex(c.infoBoxBg, DEFAULT_THEME.colors.infoBoxBg),
      infoBoxBorder: safeHex(c.infoBoxBorder, DEFAULT_THEME.colors.infoBoxBorder),
      infoBoxInk: safeHex(c.infoBoxInk, DEFAULT_THEME.colors.infoBoxInk),
      procedureBg: safeHex(c.procedureBg, DEFAULT_THEME.colors.procedureBg),
      procedureBorder: safeHex(c.procedureBorder, DEFAULT_THEME.colors.procedureBorder),
      procedureInk: safeHex(c.procedureInk, DEFAULT_THEME.colors.procedureInk),
    },
    fonts: {
      body: safeFontKey(f.body, DEFAULT_THEME.fonts.body),
      heading: safeFontKey(f.heading, DEFAULT_THEME.fonts.heading),
    },
    scale: {
      base: safeRem(s.base, DEFAULT_THEME.scale.base),
      h1: safeRem(s.h1, DEFAULT_THEME.scale.h1),
      h2: safeRem(s.h2, DEFAULT_THEME.scale.h2),
      h3: safeRem(s.h3, DEFAULT_THEME.scale.h3),
    },
    editor: {
      fonts: safeOptions(e.fonts, "font", DEFAULT_THEME.editor.fonts),
      sizes: safeOptions(e.sizes, "size", DEFAULT_THEME.editor.sizes),
      colors: safeOptions(e.colors, "color", DEFAULT_THEME.editor.colors),
    },
  };
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function darken(hex: string, factor = 0.82): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

function channelLum(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastRating = "AAA" | "AA" | "AA Large" | "Fail";

export function contrastRating(ratio: number): ContrastRating {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

export interface EditorPalette {
  fonts: ThemeOption[]; 
  sizes: ThemeOption[];
  colors: ThemeOption[];
}

function withDefault(options: ThemeOption[]): ThemeOption[] {
  return options.some((o) => o.value === "") ? options : [{ label: "Default", value: "" }, ...options];
}

export function themeToEditorPalette(theme: KbTheme): EditorPalette {
  return {
    fonts: withDefault(theme.editor.fonts.map((o) => ({ label: o.label, value: o.value ? fontStack(o.value) : "" }))),
    sizes: withDefault(theme.editor.sizes),
    colors: withDefault(theme.editor.colors),
  };
}

export function themeToCssVars(theme: KbTheme): Record<string, string> {
  return {
    "--ink": theme.colors.ink,
    "--h1-color": theme.colors.h1,
    "--h2-color": theme.colors.h2,
    "--h3-color": theme.colors.h3,
    "--wsu-crimson": theme.colors.accent,
    "--wsu-crimson-dark": darken(theme.colors.accent),
    "--muted": theme.colors.muted,
    "--line": theme.colors.line,
    "--paper": theme.colors.paper,
    "--wash": theme.colors.wash,
    "--info-box-bg": theme.colors.infoBoxBg,
    "--info-box-border": theme.colors.infoBoxBorder,
    "--info-box-ink": theme.colors.infoBoxInk,
    "--procedure-bg": theme.colors.procedureBg,
    "--procedure-border": theme.colors.procedureBorder,
    "--procedure-ink": theme.colors.procedureInk,
    "--font-body": fontStack(theme.fonts.body),
    "--font-heading": fontStack(theme.fonts.heading),
    "--base-size": theme.scale.base,
    "--h1-size": `clamp(2.25rem, 5vw, ${theme.scale.h1})`,
    "--h2-size": theme.scale.h2,
    "--h3-size": theme.scale.h3,
  };
}
