"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DropdownSelect } from "@/components/DropdownSelect";
import {
  DEFAULT_THEME,
  HEADING_FONT_STYLES,
  HEADING_TEXT_DECORATIONS,
  HEADING_TEXT_TRANSFORMS,
  HEADING_WEIGHTS,
  SAFE_FONTS,
  contrastRating,
  contrastRatio,
  mergeTheme,
  themeToCssVars,
  type HeadingLevel,
  type ThemeHeadingStyle,
  type KbTheme,
} from "@/lib/kb-theme";

const COLOR_FIELDS: { key: keyof KbTheme["colors"]; label: string; help: string }[] = [
  { key: "ink", label: "Body text", help: "Paragraph and list text" },
  { key: "h1", label: "Heading 1", help: "H1 page/section titles" },
  { key: "h2", label: "Heading 2", help: "H2 section headings" },
  { key: "h3", label: "Heading 3", help: "H3 sub-headings" },
  { key: "h4", label: "Heading 4", help: "H4 detail headings" },
  { key: "accent", label: "Brand / accent", help: "Links, buttons, highlights" },
  { key: "muted", label: "Muted text", help: "Secondary captions and meta" },
  { key: "paper", label: "Surface", help: "Cards and panels" },
  { key: "wash", label: "Page background", help: "Behind the content" },
  { key: "line", label: "Borders", help: "Dividers and outlines" },
];

const INFO_BOX_FIELDS: { key: keyof KbTheme["colors"]; label: string; help: string }[] = [
  { key: "infoBoxBg", label: "Background", help: "Box fill color" },
  { key: "infoBoxBorder", label: "Border", help: "Accent line color" },
  { key: "infoBoxInk", label: "Text", help: "Content color" },
];

const EXCERPT_BOX_FIELDS: { key: keyof KbTheme["colors"]; label: string; help: string }[] = [
  { key: "excerptBoxBg", label: "Background", help: "Box fill color" },
  { key: "excerptBoxBorder", label: "Border", help: "Accent line color" },
  { key: "excerptBoxInk", label: "Text", help: "Content and source-link color" },
];

const SOURCE_BOX_FIELDS: { key: keyof KbTheme["colors"]; label: string; help: string }[] = [
  { key: "sourceBoxBg", label: "Background", help: "Box fill color" },
  { key: "sourceBoxBorder", label: "Border", help: "Accent line color" },
  { key: "sourceBoxInk", label: "Text", help: "Content and source-link color" },
];

const PROCEDURE_FIELDS: { key: keyof KbTheme["colors"]; label: string; help: string }[] = [
  { key: "procedureBg", label: "Background", help: "Section fill color" },
  { key: "procedureBorder", label: "Line", help: "Divider/border color" },
  { key: "procedureInk", label: "Content", help: "Text and header color" },
];

const FONT_KEYS = Object.keys(SAFE_FONTS);
const HEADING_LEVELS: HeadingLevel[] = ["h1", "h2", "h3", "h4"];
const FONT_OPTIONS = FONT_KEYS.map((key) => ({
  label: SAFE_FONTS[key].label,
  value: key,
}));
const HEADING_FONT_OPTIONS = [{ label: "Use heading font", value: "" }, ...FONT_OPTIONS];
const HEADING_WEIGHT_OPTIONS = HEADING_WEIGHTS.map((weight) => ({ label: weight, value: weight }));
const HEADING_STYLE_OPTIONS = HEADING_FONT_STYLES.map((style) => ({ label: style, value: style }));
const HEADING_DECORATION_OPTIONS = HEADING_TEXT_DECORATIONS.map((decoration) => ({ label: decoration, value: decoration }));
const HEADING_TRANSFORM_OPTIONS = HEADING_TEXT_TRANSFORMS.map((transform) => ({ label: transform, value: transform }));

const TYPO_FIELDS: {
  key: keyof KbTheme["typography"];
  label: string;
  help: string;
  unit: "" | "em" | "rem" | "ch";
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "bodyLeading", label: "Body line height", help: "Leading for paragraphs and lists", unit: "", min: 1.2, max: 2.2, step: 0.05 },
  { key: "headingLeading", label: "Heading line height", help: "Leading for H1–H4", unit: "", min: 1, max: 1.6, step: 0.05 },
  { key: "bodyTracking", label: "Body letter-spacing", help: "Tracking for body text", unit: "em", min: -0.02, max: 0.1, step: 0.005 },
  { key: "headingTracking", label: "Heading letter-spacing", help: "Tracking for headings", unit: "em", min: -0.06, max: 0.1, step: 0.005 },
  { key: "blockSpacing", label: "Block spacing", help: "Gap between blocks (and before headings)", unit: "rem", min: 0.5, max: 3, step: 0.05 },
  { key: "spaceAfterHeading", label: "Space after heading", help: "Gap below a heading, e.g. heading → list", unit: "rem", min: 0, max: 2, step: 0.05 },
  { key: "listItemSpacing", label: "List item spacing", help: "Gap between list items", unit: "rem", min: 0, max: 1.5, step: 0.05 },
  { key: "listIndent", label: "List indent", help: "List indentation", unit: "rem", min: 0.5, max: 3, step: 0.05 },
];

const LAYOUT_FIELDS: {
  key: keyof KbTheme["layout"];
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "navWidth", label: "Page tree width", help: "Max width of the left navigation column", min: 180, max: 360, step: 5 },
  { key: "tocWidth", label: "TOC width", help: "Max width of the on-this-page rail", min: 200, max: 320, step: 5 },
];

// Approximate px per "ch" at the default 16px body size; good enough for the layout hint.
const PX_PER_CH = 8;
// .layout grid gaps (3rem each) and .article horizontal padding (3.5rem each side).
const LAYOUT_GAPS_PX = 96;
const ARTICLE_PADDING_PX = 112;
const DEFAULT_CONTENT_WIDTH = 1720;

function remToNumber(value: string): number {
  return Number(value.replace("rem", "")) || 0;
}

function typoToNumber(value: string): number {
  return parseFloat(value) || 0;
}

function ContrastRow({ label, fg, bg, large }: { label: string; fg: string; bg: string; large?: boolean }) {
  const ratio = contrastRatio(fg, bg);
  const rating = contrastRating(ratio);
  const ok = large ? ratio >= 3 : ratio >= 4.5;
  return (
    <div className="theme-contrast__row">
      <span className="theme-contrast__swatch" style={{ background: bg, color: fg }}>
        Aa
      </span>
      <span className="theme-contrast__label">{label}</span>
      <span className="theme-contrast__ratio">{ratio.toFixed(2)}:1</span>
      <span className={`theme-contrast__badge ${ok ? "is-ok" : "is-bad"}`}>{ok ? rating : "Fails AA"}</span>
    </div>
  );
}

export function ThemeEditor({
  kbTitle,
  initialTheme,
  dbEnabled,
  onSave,
  siteContentWidth,
  contentWidthField,
}: {
  kbTitle: string;
  initialTheme: KbTheme;
  dbEnabled: boolean;
  onSave: (theme: KbTheme) => Promise<void>;
  /** Site-wide max content width in px (0 = default). Used to warn when Reading width can't take effect. */
  siteContentWidth?: number;
  /** Optional extra control (e.g. the site Max content width input) rendered inside the Layout fieldset. */
  contentWidthField?: ReactNode;
}) {
  const [theme, setTheme] = useState<KbTheme>(() => mergeTheme(initialTheme));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const previewVars = useMemo(() => themeToCssVars(theme), [theme]);
  const previewRef = useRef<HTMLDivElement>(null);

  const measureUnlimited = theme.typography.measure === "0ch";
  const lastMeasure = useRef("72ch");

  function toggleMeasureLimit(unlimited: boolean) {
    if (unlimited) {
      lastMeasure.current = theme.typography.measure;
      setTheme((t) => ({ ...t, typography: { ...t.typography, measure: "0ch" } }));
    } else {
      const restored = lastMeasure.current === "0ch" ? "72ch" : lastMeasure.current;
      setTheme((t) => ({ ...t, typography: { ...t.typography, measure: restored } }));
    }
  }

  // Warn when the Reading width slider is capped by the page layout and can't visibly grow.
  const widthHint = useMemo(() => {
    if (theme.typography.measure === "0ch") return null;
    const shell = siteContentWidth && siteContentWidth > 0 ? siteContentWidth : DEFAULT_CONTENT_WIDTH;
    const nav = parseFloat(theme.layout.navWidth) || 280;
    const toc = parseFloat(theme.layout.tocWidth) || 260;
    const textWidth = shell - nav - toc - LAYOUT_GAPS_PX - ARTICLE_PADDING_PX;
    const measurePx = (parseFloat(theme.typography.measure) || 72) * PX_PER_CH;
    if (measurePx <= textWidth) return null;
    const effectiveCh = Math.max(0, Math.floor(textWidth / PX_PER_CH));
    return (
      `With the current max page width (${shell}px) and side column sizes, the article text column tops out ` +
      `around ${effectiveCh}ch, so Reading width settings above that have no visible effect. Raise the max ` +
      `content width or narrow the page tree / TOC columns to allow longer lines.`
    );
  }, [siteContentWidth, theme.layout.navWidth, theme.layout.tocWidth, theme.typography.measure]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    for (const [key, value] of Object.entries(previewVars)) {
      el.style.setProperty(key, value);
    }
  }, [previewVars]);

  function setColor(key: keyof KbTheme["colors"], value: string) {
    setTheme((t) => ({ ...t, colors: { ...t.colors, [key]: value } }));
  }
  function setFont(key: keyof KbTheme["fonts"], value: string) {
    setTheme((t) => ({ ...t, fonts: { ...t.fonts, [key]: value } }));
  }
  function setScale(key: keyof KbTheme["scale"], rem: number) {
    setTheme((t) => ({ ...t, scale: { ...t.scale, [key]: `${rem}rem` } }));
  }
  function setTypography(key: keyof KbTheme["typography"], num: number, unit: string) {
    setTheme((t) => ({ ...t, typography: { ...t.typography, [key]: `${num}${unit}` } }));
  }
  function setLayout(key: keyof KbTheme["layout"], px: number) {
    setTheme((t) => ({ ...t, layout: { ...t.layout, [key]: `${px}px` } }));
  }
  function setHeadingStyle<K extends keyof ThemeHeadingStyle>(level: HeadingLevel, key: K, value: ThemeHeadingStyle[K]) {
    setTheme((t) => ({
      ...t,
      headingStyles: {
        ...t.headingStyles,
        [level]: { ...t.headingStyles[level], [key]: value },
      },
    }));
  }

  function toggleEditorFont(key: string, label: string, on: boolean) {
    setTheme((t) => {
      const fonts = on
        ? [...t.editor.fonts, { label, value: key }]
        : t.editor.fonts.filter((o) => o.value !== key);
      return { ...t, editor: { ...t.editor, fonts } };
    });
  }
  function addEditorColor() {
    setTheme((t) => ({
      ...t,
      editor: { ...t.editor, colors: [...t.editor.colors, { label: "Color", value: theme.colors.accent }] },
    }));
  }
  function setEditorColor(index: number, value: string) {
    setTheme((t) => {
      const colors = t.editor.colors.map((c, i) => (i === index ? { ...c, value } : c));
      return { ...t, editor: { ...t.editor, colors } };
    });
  }
  function removeEditorColor(index: number) {
    setTheme((t) => ({ ...t, editor: { ...t.editor, colors: t.editor.colors.filter((_, i) => i !== index) } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await onSave(theme);
      setMessage("Styles saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save styles.");
    } finally {
      setSaving(false);
    }
  }

  function applyImport() {
    try {
      const parsed = JSON.parse(importText);
      setTheme(mergeTheme(parsed));
      setImportOpen(false);
      setMessage("Imported. Review the preview, then Save.");
    } catch {
      setError("That isn't valid theme JSON.");
    }
  }

  return (
    <div className="theme-editor">
      <div className="theme-editor__controls">
        {error && <p className="alert alert--error">{error}</p>}
        {message && <p className="alert alert--success">{message}</p>}
        {!dbEnabled && (
          <p className="alert alert--warning">
            No database is configured, so styles can be previewed here but not saved.
          </p>
        )}

        <fieldset className="fieldset">
          <legend>Base Colors</legend>
          <div className="theme-color-grid">
            {COLOR_FIELDS.map((field) => (
              <div className="theme-color" key={field.key}>
                <span className="meta">{field.label}</span>
                <div className="theme-color__inputs">
                  <input
                    aria-label={`${field.label} color`}
                    onChange={(e) => setColor(field.key, e.target.value)}
                    type="color"
                    value={theme.colors[field.key]}
                  />
                  <input
                    className="input"
                    onChange={(e) => setColor(field.key, e.target.value)}
                    value={theme.colors[field.key]}
                  />
                </div>
                <span className="theme-color__help">{field.help}</span>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Info Box Styles</legend>
          <div className="theme-color-grid">
            {INFO_BOX_FIELDS.map((field) => (
              <div className="theme-color" key={field.key}>
                <span className="meta">{field.label}</span>
                <div className="theme-color__inputs">
                  <input
                    aria-label={`${field.label} color`}
                    onChange={(e) => setColor(field.key, e.target.value)}
                    type="color"
                    value={theme.colors[field.key]}
                  />
                  <input
                    className="input"
                    onChange={(e) => setColor(field.key, e.target.value)}
                    value={theme.colors[field.key]}
                  />
                </div>
                <span className="theme-color__help">{field.help}</span>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Included Excerpt Styles</legend>
          <div className="theme-color-grid">
            {EXCERPT_BOX_FIELDS.map((field) => (
              <div className="theme-color" key={field.key}>
                <span className="meta">{field.label}</span>
                <div className="theme-color__inputs">
                  <input
                    aria-label={`${field.label} color`}
                    onChange={(e) => setColor(field.key, e.target.value)}
                    type="color"
                    value={theme.colors[field.key]}
                  />
                  <input
                    className="input"
                    onChange={(e) => setColor(field.key, e.target.value)}
                    value={theme.colors[field.key]}
                  />
                </div>
                <span className="theme-color__help">{field.help}</span>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>External Source Styles</legend>
          <div className="theme-color-grid">
            {SOURCE_BOX_FIELDS.map((field) => (
              <div className="theme-color" key={field.key}>
                <span className="meta">{field.label}</span>
                <div className="theme-color__inputs">
                  <input
                    aria-label={`${field.label} color`}
                    onChange={(e) => setColor(field.key, e.target.value)}
                    type="color"
                    value={theme.colors[field.key]}
                  />
                  <input
                    className="input"
                    onChange={(e) => setColor(field.key, e.target.value)}
                    value={theme.colors[field.key]}
                  />
                </div>
                <span className="theme-color__help">{field.help}</span>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Procedure Section Styles</legend>
          <div className="theme-color-grid">
            {PROCEDURE_FIELDS.map((field) => (
              <div className="theme-color" key={field.key}>
                <span className="meta">{field.label}</span>
                <div className="theme-color__inputs">
                  <input
                    aria-label={`${field.label} color`}
                    onChange={(e) => setColor(field.key, e.target.value)}
                    type="color"
                    value={theme.colors[field.key]}
                  />
                  <input
                    className="input"
                    onChange={(e) => setColor(field.key, e.target.value)}
                    value={theme.colors[field.key]}
                  />
                </div>
                <span className="theme-color__help">{field.help}</span>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Fonts</legend>
          <div className="field-row theme-editor__font-row">
            <div>
              <DropdownSelect
                label="Body font"
                onChange={(value) => setFont("body", value)}
                options={FONT_OPTIONS}
                searchable={false}
                value={theme.fonts.body}
              />
            </div>
            <div>
              <DropdownSelect
                label="Heading font"
                onChange={(value) => setFont("heading", value)}
                options={FONT_OPTIONS}
                searchable={false}
                value={theme.fonts.heading}
              />
            </div>
          </div>
          <div className="theme-heading-grid theme-editor__heading-fonts">
            {HEADING_LEVELS.map((level) => (
              <div key={level}>
                <DropdownSelect
                  label={`${level.toUpperCase()} font`}
                  onChange={(value) => setFont(level, value)}
                  options={HEADING_FONT_OPTIONS}
                  searchable={false}
                  value={theme.fonts[level]}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Type scale</legend>
          {(["base", "h1", "h2", "h3", "h4"] as const).map((key) => (
            <label className="theme-scale" key={key}>
              <span className="meta">{key === "base" ? "Body" : key.toUpperCase()}</span>
              <input
                max={key === "base" ? 1.5 : 5}
                min={key === "base" ? 0.875 : 1}
                onChange={(e) => setScale(key, Number(e.target.value))}
                step={0.05}
                type="range"
                value={remToNumber(theme.scale[key])}
              />
              <span className="theme-scale__value">{theme.scale[key]}</span>
            </label>
          ))}
          <p className="meta">H1 stays responsive (the value sets its maximum size on wide screens).</p>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Heading Effects</legend>
          <div className="theme-heading-grid">
            {HEADING_LEVELS.map((level) => (
              <div className="theme-heading-style" key={level}>
                <span className="meta">{level.toUpperCase()}</span>
                <DropdownSelect
                  label="Weight"
                  onChange={(value) => setHeadingStyle(level, "weight", value)}
                  options={HEADING_WEIGHT_OPTIONS}
                  searchable={false}
                  value={theme.headingStyles[level].weight}
                />
                <DropdownSelect
                  label="Style"
                  onChange={(value) => setHeadingStyle(level, "style", value as ThemeHeadingStyle["style"])}
                  options={HEADING_STYLE_OPTIONS}
                  searchable={false}
                  value={theme.headingStyles[level].style}
                />
                <DropdownSelect
                  label="Decoration"
                  onChange={(value) => setHeadingStyle(level, "decoration", value as ThemeHeadingStyle["decoration"])}
                  options={HEADING_DECORATION_OPTIONS}
                  searchable={false}
                  value={theme.headingStyles[level].decoration}
                />
                <DropdownSelect
                  label="Case"
                  onChange={(value) => setHeadingStyle(level, "transform", value as ThemeHeadingStyle["transform"])}
                  options={HEADING_TRANSFORM_OPTIONS}
                  searchable={false}
                  value={theme.headingStyles[level].transform}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Typography &amp; spacing</legend>
          <p className="meta">
            Readability controls applied across this KB&apos;s pages and home content. Line heights stay
            unitless so they scale with the reader&apos;s zoom.
          </p>
          {TYPO_FIELDS.map((field) => (
            <label className="theme-scale" key={field.key} title={field.help}>
              <span className="meta">{field.label}</span>
              <input
                max={field.max}
                min={field.min}
                onChange={(e) => setTypography(field.key, Number(e.target.value), field.unit)}
                step={field.step}
                type="range"
                value={typoToNumber(theme.typography[field.key])}
              />
              <span className="theme-scale__value">{theme.typography[field.key]}</span>
            </label>
          ))}
          <p className="meta">“Space after heading” controls the gap between a heading and the list or text below it.</p>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Page &amp; column widths</legend>
          <p className="meta">
            Widths of the three columns on KB pages: the page tree, the article (reading) column, and the
            table-of-contents rail.
          </p>
          {contentWidthField}
          <label className="theme-scale" title="Max line length of the article column">
            <span className="meta">Reading width</span>
            <input
              disabled={measureUnlimited}
              max={120}
              min={45}
              onChange={(e) => setTypography("measure", Number(e.target.value), "ch")}
              step={1}
              type="range"
              value={measureUnlimited ? 120 : typoToNumber(theme.typography.measure)}
            />
            <span className="theme-scale__value">{measureUnlimited ? "No limit" : theme.typography.measure}</span>
          </label>
          <label className="checkbox-inline">
            <input
              checked={measureUnlimited}
              onChange={(e) => toggleMeasureLimit(e.target.checked)}
              type="checkbox"
            />
            <span>No limit — the article fills the available width</span>
          </label>
          {LAYOUT_FIELDS.map((field) => (
            <label className="theme-scale" key={field.key} title={field.help}>
              <span className="meta">{field.label}</span>
              <input
                max={field.max}
                min={field.min}
                onChange={(e) => setLayout(field.key, Number(e.target.value))}
                step={field.step}
                type="range"
                value={parseFloat(theme.layout[field.key]) || 0}
              />
              <span className="theme-scale__value">{theme.layout[field.key]}</span>
            </label>
          ))}
          {widthHint && <p className="alert alert--warning">{widthHint}</p>}
        </fieldset>

        <fieldset className="fieldset">
          <legend>Editor palette</legend>
          <p className="meta">Which fonts and colors editors can apply to text in this KB.</p>
          <span className="meta">Fonts</span>
          <div className="theme-font-checks">
            {FONT_KEYS.map((k) => {
              const on = theme.editor.fonts.some((o) => o.value === k);
              return (
                <label className="checkbox-inline" key={k}>
                  <input checked={on} onChange={(e) => toggleEditorFont(k, SAFE_FONTS[k].label, e.target.checked)} type="checkbox" />
                  <span>{SAFE_FONTS[k].label}</span>
                </label>
              );
            })}
          </div>
          <span className="meta" style={{ marginTop: "0.75rem", display: "block" }}>
            Text colors
          </span>
          <div className="theme-swatches">
            {theme.editor.colors
              .filter((c) => c.value)
              .map((c, i) => (
                <div className="theme-swatch" key={i}>
                  <input aria-label="Palette color" onChange={(e) => setEditorColor(i, e.target.value)} type="color" value={c.value} />
                  <button className="theme-swatch__remove" onClick={() => removeEditorColor(i)} type="button" aria-label="Remove color">
                    ✕
                  </button>
                </div>
              ))}
            <button className="button button--small button--ghost" onClick={addEditorColor} type="button">
              + Color
            </button>
          </div>
        </fieldset>

        <div className="admin-actions theme-editor__actions">
          <button className="button" disabled={saving || !dbEnabled} onClick={save} type="button">
            {saving ? "Saving…" : "Save styles"}
          </button>
          <button className="button button--ghost" onClick={() => setTheme(DEFAULT_THEME)} type="button">
            Reset to default
          </button>
          <button className="button button--ghost" onClick={() => setImportOpen((v) => !v)} type="button">
            Import / Export
          </button>
        </div>

        {importOpen && (
          <div className="card" style={{ marginTop: "1rem" }}>
            <label>
              <span className="meta">Theme JSON (paste to import, or copy to export)</span>
              <textarea
                className="input"
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
                value={importText || JSON.stringify(theme, null, 2)}
              />
            </label>
            <div className="admin-actions">
              <button className="button button--small" onClick={applyImport} type="button">
                Import this JSON
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="theme-preview" aria-label="Live preview">
        <strong className="meta">Live preview — {kbTitle}</strong>
        <div className="theme-preview__surface flow" ref={previewRef} style={previewVars as CSSProperties}>
          <p className="eyebrow">Article</p>
          <h1>Heading one</h1>
          <h2>Heading two</h2>
          <p>
            Body text shows the chosen font, size, and color. Here is a <a href="#preview">styled link</a> and some{" "}
            <strong>bold emphasis</strong> for contrast.
          </p>
          <h3>Section with a list</h3>
          <ul>
            <li>First item — note the gap above set by “space after heading”.</li>
            <li>Second item — spacing between items is its own control.</li>
          </ul>
          <h4>Heading four</h4>
          <p>Detail headings can now use their own font, color, size, weight, style, decoration, and case.</p>

          <div 
            className="alert alert--info" 
            style={{ 
              background: "var(--info-box-bg)", 
              borderColor: "var(--info-box-border)",
              color: "var(--info-box-ink)",
              borderLeftWidth: "4px",
              borderLeftStyle: "solid",
              padding: "1rem",
              margin: "1rem 0"
            }}
          >
            <strong>Info Box Preview</strong>
            <p style={{ margin: 0 }}>This box uses the Info Box theme colors.</p>
          </div>

          <h3>Heading three</h3>

          <div 
            className="procedure-section" 
            style={{ 
              background: "var(--procedure-bg)", 
              border: "1px solid var(--procedure-border)",
              color: "var(--procedure-ink)",
              padding: "1.5rem",
              margin: "1.5rem 0",
              borderRadius: "4px"
            }}
          >
            <strong>Procedure Preview</strong>
            <p>Step-by-step guidance uses these colors.</p>
          </div>

          <div className="card">
            <strong>Card surface</strong>
            <p className="meta">Muted caption text sits on the surface color.</p>
          </div>
          <button className="button" type="button">
            Brand button
          </button>
        </div>

        <div className="theme-contrast">
          <strong className="meta">Accessibility (WCAG contrast)</strong>
          <ContrastRow bg={theme.colors.paper} fg={theme.colors.ink} label="Body text on surface" />
          <ContrastRow bg={theme.colors.wash} fg={theme.colors.ink} label="Body text on background" />
          <ContrastRow bg={theme.colors.infoBoxBg} fg={theme.colors.infoBoxInk} label="Info Box content" />
          <ContrastRow bg={theme.colors.excerptBoxBg} fg={theme.colors.excerptBoxInk} label="Included excerpt content" />
          <ContrastRow bg={theme.colors.sourceBoxBg} fg={theme.colors.sourceBoxInk} label="External source content" />
          <ContrastRow bg={theme.colors.procedureBg} fg={theme.colors.procedureInk} label="Procedure content" />
          <ContrastRow bg={theme.colors.accent} fg="#ffffff" label="Button label on brand" />
          <ContrastRow bg={theme.colors.paper} fg={theme.colors.accent} label="Link on surface" />
          <p className="meta">Aim for AA (4.5:1) for normal text. Large text passes at 3:1.</p>
        </div>
      </aside>
    </div>
  );
}
