"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  DEFAULT_THEME,
  SAFE_FONTS,
  contrastRating,
  contrastRatio,
  mergeTheme,
  themeToCssVars,
  type KbTheme,
} from "@/lib/kb-theme";

const COLOR_FIELDS: { key: keyof KbTheme["colors"]; label: string; help: string }[] = [
  { key: "ink", label: "Body text", help: "Paragraph and list text" },
  { key: "h1", label: "Heading 1", help: "H1 page/section titles" },
  { key: "h2", label: "Heading 2", help: "H2 section headings" },
  { key: "h3", label: "Heading 3", help: "H3 sub-headings" },
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

function remToNumber(value: string): number {
  return Number(value.replace("rem", "")) || 0;
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
  kbId,
  kbTitle,
  initialTheme,
  dbEnabled,
}: {
  kbId: string;
  kbTitle: string;
  initialTheme: KbTheme;
  dbEnabled: boolean;
}) {
  const [theme, setTheme] = useState<KbTheme>(initialTheme);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const previewVars = useMemo(() => themeToCssVars(theme), [theme]);
  const previewRef = useRef<HTMLDivElement>(null);

  // Apply the theme variables to the preview imperatively so every change is
  // reflected reliably (and clear any stale custom properties).
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
      const res = await fetch(`/api/admin/kbs/${kbId}/theme`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Could not save styles.");
      setTheme(data.theme as KbTheme);
      setMessage("Styles saved. Public pages for this KB now use them.");
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
        </fieldset>

        <fieldset className="fieldset">
          <legend>Type scale</legend>
          {(["base", "h1", "h2", "h3"] as const).map((key) => (
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
        <div className="theme-preview__surface" ref={previewRef} style={previewVars as CSSProperties}>
          <p className="eyebrow">Article</p>
          <h1>Heading one</h1>
          <h2>Heading two</h2>
          <p>
            Body text shows the chosen font, size, and color. Here is a <a href="#preview">styled link</a> and some{" "}
            <strong>bold emphasis</strong> for contrast.
          </p>

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
            <h4 style={{ color: "var(--procedure-ink)", marginTop: 0 }}>Procedure Preview</h4>
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
