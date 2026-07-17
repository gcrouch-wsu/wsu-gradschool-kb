export interface ThemeColors {
  ink: string; 
  h1: string; 
  h2: string; 
  h3: string; 
  h4: string;
  accent: string; 
  muted: string; 
  line: string; 
  paper: string; 
  wash: string; 
  infoBoxBg: string;
  infoBoxBorder: string;
  infoBoxInk: string;
  excerptBoxBg: string;
  excerptBoxBorder: string;
  excerptBoxInk: string;
  sourceBoxBg: string;
  sourceBoxBorder: string;
  sourceBoxInk: string;
  procedureBg: string;
  procedureBorder: string;
  procedureInk: string;
}

export interface ThemeFonts {
  body: string; 
  heading: string; 
  h1: string;
  h2: string;
  h3: string;
  h4: string;
}

export interface ThemeScale {
  base: string;
  h1: string;
  h2: string;
  h3: string;
  h4: string;
}

export type HeadingLevel = "h1" | "h2" | "h3" | "h4";
export type HeadingFontStyle = "normal" | "italic";
export type HeadingTextDecoration = "none" | "underline";
export type HeadingTextTransform = "none" | "uppercase" | "capitalize";

export interface ThemeHeadingStyle {
  weight: string;
  style: HeadingFontStyle;
  decoration: HeadingTextDecoration;
  transform: HeadingTextTransform;
}

export type ThemeHeadingStyles = Record<HeadingLevel, ThemeHeadingStyle>;

export interface ThemeTypography {
  bodyLeading: string; // unitless line-height for body text
  headingLeading: string; // unitless line-height for headings
  bodyTracking: string; // letter-spacing (em) for body text
  headingTracking: string; // letter-spacing (em) for headings
  blockSpacing: string; // rem; vertical gap between content blocks (and before headings)
  spaceAfterHeading: string; // rem; gap below a heading (e.g. heading -> list)
  listItemSpacing: string; // rem; gap between list items
  listIndent: string; // rem; list indentation
  measure: string; // ch; max reading line length in the article column ("0ch" = no cap, fill the column)
}

export interface ThemeLayout {
  navWidth: string; // px; max width of the page-tree column on KB pages
  tocWidth: string; // px; max width of the table-of-contents rail on KB pages
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
  headingStyles: ThemeHeadingStyles;
  typography: ThemeTypography;
  layout: ThemeLayout;
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

export const HEADING_WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"] as const;
export const HEADING_FONT_STYLES: HeadingFontStyle[] = ["normal", "italic"];
export const HEADING_TEXT_DECORATIONS: HeadingTextDecoration[] = ["none", "underline"];
export const HEADING_TEXT_TRANSFORMS: HeadingTextTransform[] = ["none", "uppercase", "capitalize"];

export function fontStack(key: string): string {
  return SAFE_FONTS[key]?.stack ?? SAFE_FONTS.system.stack;
}

export const DEFAULT_THEME: KbTheme = {
  colors: {
    ink: "#1d1a1b",
    h1: "#1d1a1b",
    h2: "#1d1a1b",
    h3: "#1d1a1b",
    h4: "#1d1a1b",
    accent: "#a60f2d",
    muted: "#6b6466",
    line: "#e4ddd8",
    paper: "#ffffff",
    wash: "#f6f3f0",
    infoBoxBg: "#f6f3f0",
    infoBoxBorder: "#a60f2d",
    infoBoxInk: "#1d1a1b",
    excerptBoxBg: "#f4f6f6",
    excerptBoxBorder: "#5e6a71",
    excerptBoxInk: "#1d1a1b",
    sourceBoxBg: "#f8f5ee",
    sourceBoxBorder: "#8a7237",
    sourceBoxInk: "#1d1a1b",
    procedureBg: "#ffffff",
    procedureBorder: "#e4ddd8",
    procedureInk: "#1d1a1b",
  },
  fonts: { body: "system", heading: "system", h1: "", h2: "", h3: "", h4: "" },
  scale: { base: "1rem", h1: "3.5rem", h2: "1.75rem", h3: "1.4rem", h4: "1.15rem" },
  headingStyles: {
    h1: { weight: "900", style: "normal", decoration: "none", transform: "none" },
    h2: { weight: "800", style: "normal", decoration: "none", transform: "none" },
    h3: { weight: "700", style: "normal", decoration: "none", transform: "none" },
    h4: { weight: "700", style: "normal", decoration: "none", transform: "none" },
  },
  typography: {
    bodyLeading: "1.65",
    headingLeading: "1.2",
    bodyTracking: "0em",
    headingTracking: "-0.02em",
    blockSpacing: "1.5rem",
    spaceAfterHeading: "0.5rem",
    listItemSpacing: "0.4rem",
    listIndent: "1.75rem",
    measure: "0ch",
  },
  layout: {
    navWidth: "260px",
    tocWidth: "240px",
  },
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
const EM = /^-?\d+(\.\d+)?em$/;
const CH = /^\d+(\.\d+)?ch$/;
const PX = /^\d+(\.\d+)?px$/;
const UNITLESS = /^\d+(\.\d+)?$/;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Validate an unitless line-height ("1.65"), clamping to a safe range.
function safeLeading(value: unknown, fallback: string, min: number, max: number): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(clampNumber(value, min, max));
  if (typeof value === "string" && UNITLESS.test(value.trim())) {
    return String(clampNumber(parseFloat(value), min, max));
  }
  return fallback;
}

// Validate a unit-bearing length ("1.5rem" / "-0.02em" / "72ch"), clamping the numeric part.
function safeUnit(value: unknown, unit: "rem" | "em" | "ch" | "px", re: RegExp, fallback: string, min: number, max: number): string {
  if (typeof value === "number" && Number.isFinite(value)) return `${clampNumber(value, min, max)}${unit}`;
  if (typeof value === "string" && re.test(value.trim())) {
    return `${clampNumber(parseFloat(value), min, max)}${unit}`;
  }
  return fallback;
}

// Reading width: "0ch" disables the line-length cap; anything else clamps to a sane range.
function safeMeasure(value: unknown, fallback: string): string {
  const num =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && CH.test(value.trim())
        ? parseFloat(value)
        : null;
  if (num === null) return fallback;
  if (num === 0) return "0ch";
  return `${clampNumber(num, 40, 140)}ch`;
}

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

function safeOptionalFontKey(value: unknown, fallback: string): string {
  if (value === "" || value == null) return "";
  return safeFontKey(value, fallback);
}

function safeHeadingStyle(value: unknown, fallback: ThemeHeadingStyle): ThemeHeadingStyle {
  const raw = (value ?? {}) as Partial<ThemeHeadingStyle>;
  return {
    weight:
      typeof raw.weight === "string" && (HEADING_WEIGHTS as readonly string[]).includes(raw.weight)
        ? raw.weight
        : fallback.weight,
    style: HEADING_FONT_STYLES.includes(raw.style as HeadingFontStyle)
      ? (raw.style as HeadingFontStyle)
      : fallback.style,
    decoration: HEADING_TEXT_DECORATIONS.includes(raw.decoration as HeadingTextDecoration)
      ? (raw.decoration as HeadingTextDecoration)
      : fallback.decoration,
    transform: HEADING_TEXT_TRANSFORMS.includes(raw.transform as HeadingTextTransform)
      ? (raw.transform as HeadingTextTransform)
      : fallback.transform,
  };
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

export function mergeTheme(input: unknown, base: KbTheme = DEFAULT_THEME): KbTheme {
  const t = (input ?? {}) as Partial<KbTheme>;
  const c = (t.colors ?? {}) as Partial<ThemeColors>;
  const f = (t.fonts ?? {}) as Partial<ThemeFonts>;
  const s = (t.scale ?? {}) as Partial<ThemeScale>;
  const hs = (t.headingStyles ?? {}) as Partial<ThemeHeadingStyles>;
  const ty = (t.typography ?? {}) as Partial<ThemeTypography>;
  const l = (t.layout ?? {}) as Partial<ThemeLayout>;
  const e = (t.editor ?? {}) as Partial<ThemeEditorAllowlist>;
  return {
    colors: {
      ink: safeHex(c.ink, base.colors.ink),
      h1: safeHex(c.h1, base.colors.h1),
      h2: safeHex(c.h2, base.colors.h2),
      h3: safeHex(c.h3, base.colors.h3),
      h4: safeHex(c.h4, base.colors.h4),
      accent: safeHex(c.accent, base.colors.accent),
      muted: safeHex(c.muted, base.colors.muted),
      line: safeHex(c.line, base.colors.line),
      paper: safeHex(c.paper, base.colors.paper),
      wash: safeHex(c.wash, base.colors.wash),
      infoBoxBg: safeHex(c.infoBoxBg, base.colors.infoBoxBg),
      infoBoxBorder: safeHex(c.infoBoxBorder, base.colors.infoBoxBorder),
      infoBoxInk: safeHex(c.infoBoxInk, base.colors.infoBoxInk),
      excerptBoxBg: safeHex(c.excerptBoxBg, base.colors.excerptBoxBg),
      excerptBoxBorder: safeHex(c.excerptBoxBorder, base.colors.excerptBoxBorder),
      excerptBoxInk: safeHex(c.excerptBoxInk, base.colors.excerptBoxInk),
      sourceBoxBg: safeHex(c.sourceBoxBg, base.colors.sourceBoxBg),
      sourceBoxBorder: safeHex(c.sourceBoxBorder, base.colors.sourceBoxBorder),
      sourceBoxInk: safeHex(c.sourceBoxInk, base.colors.sourceBoxInk),
      procedureBg: safeHex(c.procedureBg, base.colors.procedureBg),
      procedureBorder: safeHex(c.procedureBorder, base.colors.procedureBorder),
      procedureInk: safeHex(c.procedureInk, base.colors.procedureInk),
    },
    fonts: {
      body: safeFontKey(f.body, base.fonts.body),
      heading: safeFontKey(f.heading, base.fonts.heading),
      h1: safeOptionalFontKey(f.h1, base.fonts.h1),
      h2: safeOptionalFontKey(f.h2, base.fonts.h2),
      h3: safeOptionalFontKey(f.h3, base.fonts.h3),
      h4: safeOptionalFontKey(f.h4, base.fonts.h4),
    },
    scale: {
      base: safeRem(s.base, base.scale.base),
      h1: safeRem(s.h1, base.scale.h1),
      h2: safeRem(s.h2, base.scale.h2),
      h3: safeRem(s.h3, base.scale.h3),
      h4: safeRem(s.h4, base.scale.h4),
    },
    headingStyles: {
      h1: safeHeadingStyle(hs.h1, base.headingStyles.h1),
      h2: safeHeadingStyle(hs.h2, base.headingStyles.h2),
      h3: safeHeadingStyle(hs.h3, base.headingStyles.h3),
      h4: safeHeadingStyle(hs.h4, base.headingStyles.h4),
    },
    typography: {
      bodyLeading: safeLeading(ty.bodyLeading, base.typography.bodyLeading, 1, 2.5),
      headingLeading: safeLeading(ty.headingLeading, base.typography.headingLeading, 0.9, 2),
      bodyTracking: safeUnit(ty.bodyTracking, "em", EM, base.typography.bodyTracking, -0.05, 0.2),
      headingTracking: safeUnit(ty.headingTracking, "em", EM, base.typography.headingTracking, -0.08, 0.2),
      blockSpacing: safeUnit(ty.blockSpacing, "rem", REM, base.typography.blockSpacing, 0, 4),
      spaceAfterHeading: safeUnit(ty.spaceAfterHeading, "rem", REM, base.typography.spaceAfterHeading, 0, 3),
      listItemSpacing: safeUnit(ty.listItemSpacing, "rem", REM, base.typography.listItemSpacing, 0, 2),
      listIndent: safeUnit(ty.listIndent, "rem", REM, base.typography.listIndent, 0, 4),
      measure: safeMeasure(ty.measure, base.typography.measure),
    },
    layout: {
      navWidth: safeUnit(l.navWidth, "px", PX, base.layout.navWidth, 160, 480),
      tocWidth: safeUnit(l.tocWidth, "px", PX, base.layout.tocWidth, 160, 420),
    },
    editor: {
      fonts: safeOptions(e.fonts, "font", base.editor.fonts),
      sizes: safeOptions(e.sizes, "size", base.editor.sizes),
      colors: safeOptions(e.colors, "color", base.editor.colors),
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
  const headingFont = fontStack(theme.fonts.heading);
  return {
    "--ink": theme.colors.ink,
    "--h1-color": theme.colors.h1,
    "--h2-color": theme.colors.h2,
    "--h3-color": theme.colors.h3,
    "--h4-color": theme.colors.h4,
    "--wsu-crimson": theme.colors.accent,
    "--wsu-crimson-dark": darken(theme.colors.accent),
    "--muted": theme.colors.muted,
    "--line": theme.colors.line,
    "--paper": theme.colors.paper,
    "--wash": theme.colors.wash,
    "--info-box-bg": theme.colors.infoBoxBg,
    "--info-box-border": theme.colors.infoBoxBorder,
    "--info-box-ink": theme.colors.infoBoxInk,
    "--excerpt-box-bg": theme.colors.excerptBoxBg,
    "--excerpt-box-border": theme.colors.excerptBoxBorder,
    "--excerpt-box-ink": theme.colors.excerptBoxInk,
    "--source-box-bg": theme.colors.sourceBoxBg,
    "--source-box-border": theme.colors.sourceBoxBorder,
    "--source-box-ink": theme.colors.sourceBoxInk,
    "--procedure-bg": theme.colors.procedureBg,
    "--procedure-border": theme.colors.procedureBorder,
    "--procedure-ink": theme.colors.procedureInk,
    "--font-body": fontStack(theme.fonts.body),
    "--font-heading": headingFont,
    "--h1-font": theme.fonts.h1 ? fontStack(theme.fonts.h1) : headingFont,
    "--h2-font": theme.fonts.h2 ? fontStack(theme.fonts.h2) : headingFont,
    "--h3-font": theme.fonts.h3 ? fontStack(theme.fonts.h3) : headingFont,
    "--h4-font": theme.fonts.h4 ? fontStack(theme.fonts.h4) : headingFont,
    "--base-size": theme.scale.base,
    "--h1-size": `clamp(2.25rem, 5vw, ${theme.scale.h1})`,
    "--h2-size": theme.scale.h2,
    "--h3-size": theme.scale.h3,
    "--h4-size": theme.scale.h4,
    "--h1-weight": theme.headingStyles.h1.weight,
    "--h2-weight": theme.headingStyles.h2.weight,
    "--h3-weight": theme.headingStyles.h3.weight,
    "--h4-weight": theme.headingStyles.h4.weight,
    "--h1-style": theme.headingStyles.h1.style,
    "--h2-style": theme.headingStyles.h2.style,
    "--h3-style": theme.headingStyles.h3.style,
    "--h4-style": theme.headingStyles.h4.style,
    "--h1-decoration": theme.headingStyles.h1.decoration,
    "--h2-decoration": theme.headingStyles.h2.decoration,
    "--h3-decoration": theme.headingStyles.h3.decoration,
    "--h4-decoration": theme.headingStyles.h4.decoration,
    "--h1-transform": theme.headingStyles.h1.transform,
    "--h2-transform": theme.headingStyles.h2.transform,
    "--h3-transform": theme.headingStyles.h3.transform,
    "--h4-transform": theme.headingStyles.h4.transform,
    "--leading-body": theme.typography.bodyLeading,
    "--leading-heading": theme.typography.headingLeading,
    "--tracking-body": theme.typography.bodyTracking,
    "--tracking-heading": theme.typography.headingTracking,
    "--space-block": theme.typography.blockSpacing,
    "--space-after-heading": theme.typography.spaceAfterHeading,
    "--space-list-item": theme.typography.listItemSpacing,
    "--indent-list": theme.typography.listIndent,
    "--measure": theme.typography.measure === "0ch" ? "100%" : theme.typography.measure,
    "--nav-width": theme.layout.navWidth,
    "--toc-width": theme.layout.tocWidth,
  };
}
