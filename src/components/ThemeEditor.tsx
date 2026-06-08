"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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

const PROCEDURE_FIELDS: { key: keyof KbTheme["colors"]; label: string; help: string }[] = [
  { key: "procedureBg", label: "Background", help: "Section fill color" },
  { key: "procedureBorder", label: "Line", help: "Divider/border color" },
  { key: "procedureInk", label: "Content", help: "Text and header color" },
];

const FONT_KEYS = Object.keys(SAFE_FONTS);
const HEADING_LEVELS: HeadingLevel[] = ["h1", "h2", "h3", "h4"];

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
  { key: "measure", label: "Reading width", help: "Max line length of the article column", unit: "ch", min: 45, max: 90, step: 1 },
];

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
}: {
  kbTitle: string;
  initialTheme: KbTheme;
  dbEnabled: boolean;
  onSave: (theme: KbTheme) => Promise<void>;
}) {
  const [theme, setTheme] = useState<KbTheme>(() => mergeTheme(initialTheme));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const previewVars = useMemo(() => themeToCssVars(theme), [theme]);
  const previewRef = useRef<HTMLDivElement>(null);

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
          <div className="field-row">
            <label>
              <span className="meta">Body font</span>
              <select className="input" onChange={(e) => setFont("body", e.target.value)} value={theme.fonts.body}>
                {FONT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {SAFE_FONTS[k].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="meta">Heading font</span>
              <select className="input" onChange={(e) => setFont("heading", e.target.value)} value={theme.fonts.heading}>
                {FONT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {SAFE_FONTS[k].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="theme-heading-grid" style={{ marginTop: "1rem" }}>
            {HEADING_LEVELS.map((level) => (
              <label key={level}>
                <span className="meta">{level.toUpperCase()} font</span>
                <select className="input" onChange={(e) => setFont(level, e.target.value)} value={theme.fonts[level]}>
                  <option value="">Use heading font</option>
                  {FONT_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {SAFE_FONTS[k].label}
                    </option>
                  ))}
                </select>
              </label>
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
                <label>
                  <span className="meta">Weight</span>
                  <select
                    className="input"
                    onChange={(e) => setHeadingStyle(level, "weight", e.target.value)}
                    value={theme.headingStyles[level].weight}
                  >
                    {HEADING_WEIGHTS.map((weight) => (
                      <option key={weight} value={weight}>
                        {weight}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="meta">Style</span>
                  <select
                    className="input"
                    onChange={(e) => setHeadingStyle(level, "style", e.target.value as ThemeHeadingStyle["style"])}
                    value={theme.headingStyles[level].style}
                  >
                    {HEADING_FONT_STYLES.map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="meta">Decoration</span>
                  <select
                    className="input"
                    onChange={(e) =>
                      setHeadingStyle(level, "decoration", e.target.value as ThemeHeadingStyle["decoration"])
                    }
                    value={theme.headingStyles[level].decoration}
                  >
                    {HEADING_TEXT_DECORATIONS.map((decoration) => (
                      <option key={decoration} value={decoration}>
                        {decoration}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="meta">Case</span>
                  <select
                    className="input"
                    onChange={(e) => setHeadingStyle(level, "transform", e.target.value as ThemeHeadingStyle["transform"])}
                    value={theme.headingStyles[level].transform}
                  >
                    {HEADING_TEXT_TRANSFORMS.map((transform) => (
                      <option key={transform} value={transform}>
                        {transform}
                      </option>
                    ))}
                  </select>
                </label>
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

        <div className="admin-actions">
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
          <ContrastRow bg={theme.colors.procedureBg} fg={theme.colors.procedureInk} label="Procedure content" />
          <ContrastRow bg={theme.colors.accent} fg="#ffffff" label="Button label on brand" />
          <ContrastRow bg={theme.colors.paper} fg={theme.colors.accent} label="Link on surface" />
          <p className="meta">Aim for AA (4.5:1) for normal text. Large text passes at 3:1.</p>
        </div>
      </aside>
    </div>
  );
}
