"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { DropdownSelect } from "@/components/DropdownSelect";
import { FileUploadPicker } from "@/components/FileUploadPicker";
import { PageDocumentEditor } from "@/components/PageDocumentEditor";
import { PageLoader } from "@/components/PageLoader";
import { ThemeEditor } from "@/components/ThemeEditor";
import { DEFAULT_THEME, SAFE_FONTS } from "@/lib/kb-theme";
import {
  ALIGNMENTS,
  BRAND_TEXT_WEIGHTS,
  type Alignment,
  type BrandTextWeight,
  type NavLink,
  type SiteSettings,
} from "@/lib/site-settings";

const acceptedLogoTypes = "image/png,image/jpeg,image/gif,image/webp";
const maxLogoSizeBytes = 5 * 1024 * 1024;

export default function AdminSettingsPage() {
  const logoUploadFieldId = useId();
  const brandWeightOptions = BRAND_TEXT_WEIGHTS.map((weight) => ({
    label: weight === "" ? "Default" : weight,
    value: weight,
  }));
  const brandFontOptions = [
    { label: "Default", value: "" },
    ...Object.entries(SAFE_FONTS).map(([key, font]) => ({
      label: font.label,
      value: key,
    })),
  ];
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dbEnabled, setDbEnabled] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "branding" | "home" | "styling">("general");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load settings"))))
      .then((data) => {
        setSettings(data.settings);
        setDbEnabled(Boolean(data.dbEnabled));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error loading settings"))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/settings/logo", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to upload logo");
      }
      update("logoUrl", data.url);
      setLogoFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error uploading logo");
    } finally {
      setLogoUploading(false);
    }
  }

  function validateLogoFile(file: File) {
    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) {
      return "Use a PNG, JPG, GIF, or WebP image.";
    }
    if (file.size > maxLogoSizeBytes) {
      return "Logo is larger than 5 MB.";
    }
    return null;
  }

  function handleLogoFileChange(file: File | null) {
    setError(null);
    setLogoFile(file);
    if (file) {
      void handleLogoUpload(file);
    }
  }

  function update<K extends keyof SiteSettings>(field: K, value: SiteSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
    setSaved(false);
  }

  function updateLinks(field: "headerLinks" | "footerLinks", index: number, key: keyof NavLink, value: string) {
    setSettings((prev) => {
      if (!prev) return prev;
      const nextLinks = [...prev[field]];
      nextLinks[index] = { ...nextLinks[index], [key]: value };
      return { ...prev, [field]: nextLinks };
    });
    setSaved(false);
  }

  function addLink(field: "headerLinks" | "footerLinks") {
    setSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: [...prev[field], { label: "", url: "" }] };
    });
    setSaved(false);
  }

  function removeLink(field: "headerLinks" | "footerLinks", index: number) {
    setSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: prev[field].filter((_, i) => i !== index) };
    });
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to save settings");
      }
      const data = await res.json();
      setSettings(data.settings);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader label="Loading settings" />;

  return (
    <div className="page-shell">
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>
      <h1>Site settings</h1>
      <p className="lead">Control site-wide content and global branding.</p>

      {error && <p className="alert alert--error">{error}</p>}
      {saved && <p className="alert alert--success">Saved successfully.</p>}

      <div className="admin-tabs" style={{ marginBottom: "2rem" }}>
        <button
          className={`tab-button ${activeTab === "general" ? "is-active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          General Header/Footer
        </button>
        <button
          className={`tab-button ${activeTab === "branding" ? "is-active" : ""}`}
          onClick={() => setActiveTab("branding")}
        >
          Logo &amp; Layout
        </button>
        <button
          className={`tab-button ${activeTab === "home" ? "is-active" : ""}`}
          onClick={() => setActiveTab("home")}
        >
          Home Page Content
        </button>
        <button
          className={`tab-button ${activeTab === "styling" ? "is-active" : ""}`}
          onClick={() => setActiveTab("styling")}
        >
          Global Styling
        </button>
      </div>

      {settings && activeTab === "general" && (
        <form className="form form--wide" onSubmit={handleSave}>
          <div className="settings-general__layout">
            <section className="card settings-general__hero">
              <h2>Home Page Hero</h2>
              <p className="meta">The main heading and introduction on the site home page.</p>
              <label>
                <span className="meta">Home title</span>
                <input
                  className="input"
                  required
                  value={settings.homeTitle}
                  onChange={(e) => update("homeTitle", e.target.value)}
                />
              </label>
              <label>
                <span className="meta">Home eyebrow</span>
                <input
                  className="input"
                  value={settings.homeEyebrow}
                  onChange={(e) => update("homeEyebrow", e.target.value)}
                />
              </label>
              <label>
                <span className="meta">Home intro paragraph</span>
                <textarea
                  className="input"
                  rows={4}
                  value={settings.homeIntro}
                  onChange={(e) => update("homeIntro", e.target.value)}
                />
              </label>
            </section>

            <section className="card settings-general__header">
              <h2>Site Header</h2>
              <div className="field-group">
                <span className="meta">Navigation Links</span>
                {settings.headerLinks.map((link, i) => (
                  <div key={i} className="link-row">
                    <input
                      className="input"
                      placeholder="Label"
                      value={link.label}
                      onChange={(e) => updateLinks("headerLinks", i, "label", e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="URL"
                      value={link.url}
                      onChange={(e) => updateLinks("headerLinks", i, "url", e.target.value)}
                    />
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      aria-label={`Remove header link ${i + 1}`}
                      onClick={() => removeLink("headerLinks", i)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="button button--small button--ghost" onClick={() => addLink("headerLinks")}>
                  + Add Link
                </button>
              </div>
            </section>

            <section className="card settings-general__footer">
              <h2>Site Footer</h2>
              <label>
                <span className="meta">Copyright/Brand Text</span>
                <input
                  className="input"
                  value={settings.footerText}
                  onChange={(e) => update("footerText", e.target.value)}
                />
              </label>
              <label>
                <span className="meta">Contact Information</span>
                <input
                  className="input"
                  value={settings.contactInfo}
                  onChange={(e) => update("contactInfo", e.target.value)}
                />
              </label>
              <div className="field-group">
                <span className="meta">Footer Links</span>
                {settings.footerLinks.map((link, i) => (
                  <div key={i} className="link-row">
                    <input
                      className="input"
                      placeholder="Label"
                      value={link.label}
                      onChange={(e) => updateLinks("footerLinks", i, "label", e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="URL"
                      value={link.url}
                      onChange={(e) => updateLinks("footerLinks", i, "url", e.target.value)}
                    />
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      aria-label={`Remove footer link ${i + 1}`}
                      onClick={() => removeLink("footerLinks", i)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="button button--small button--ghost" onClick={() => addLink("footerLinks")}>
                  + Add Link
                </button>
              </div>
            </section>
          </div>

          <div className="admin-actions settings-form__actions settings-general__actions" style={{ marginTop: "2rem" }}>
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save general settings"}
            </button>
          </div>
        </form>
      )}

      {settings && activeTab === "branding" && (
        <form className="form form--wide" onSubmit={handleSave}>
          <div className="grid settings-branding__layout">
            <section className="card">
              <h2>Site Logo</h2>
              <p className="meta">
                Shown at the top-left of every page. Leave it empty to show only the brand text.
              </p>

              {settings.logoUrl ? (
                <div className="field-group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Current logo preview"
                    src={settings.logoUrl}
                    style={{
                      maxWidth: "100%",
                      width: settings.logoWidth ? `${settings.logoWidth}px` : "auto",
                      height: "auto",
                      background: "var(--wash)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.5rem",
                    }}
                  />
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => update("logoUrl", "")}
                  >
                    Remove logo
                  </button>
                </div>
              ) : (
                <p className="meta">No logo set.</p>
              )}

              <FileUploadPicker
                accept={acceptedLogoTypes}
                disabled={logoUploading}
                file={logoFile}
                helperText="PNG, JPG, GIF, or WebP up to 5 MB"
                id={logoUploadFieldId}
                label="Upload an image"
                onError={setError}
                onFileChange={handleLogoFileChange}
                validateFile={validateLogoFile}
              />
              {logoUploading && <p className="meta">Uploading…</p>}

              <label>
                <span className="meta">…or paste an image URL</span>
                <input
                  className="input"
                  placeholder="https://…"
                  value={settings.logoUrl}
                  onChange={(e) => update("logoUrl", e.target.value)}
                />
              </label>

              <label>
                <span className="meta">Logo width in pixels (leave 0 for natural size)</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={600}
                  value={settings.logoWidth || ""}
                  onChange={(e) => update("logoWidth", Number(e.target.value) || 0)}
                />
              </label>
            </section>

            <section className="card">
              <h2>Brand &amp; Layout</h2>
              <label>
                <span className="meta">Brand text (next to the logo — leave blank to hide)</span>
                <input
                  className="input"
                  value={settings.brandText}
                  onChange={(e) => update("brandText", e.target.value)}
                />
              </label>

              <div className="field-group">
                <span className="meta">Brand text style (leave any field at default to inherit)</span>
                <div className="field-row">
                  <label style={{ flex: 1 }}>
                    <span className="meta">Color</span>
                    <div className="theme-color__inputs">
                      <input
                        aria-label="Brand text color"
                        type="color"
                        value={settings.brandTextColor || "#1d1a1b"}
                        onChange={(e) => update("brandTextColor", e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Default"
                        value={settings.brandTextColor}
                        onChange={(e) => update("brandTextColor", e.target.value)}
                      />
                    </div>
                  </label>
                  <label style={{ flex: 1 }}>
                    <span className="meta">Size (e.g. 1.1rem or 20px)</span>
                    <input
                      className="input"
                      placeholder="Default"
                      value={settings.brandTextSize}
                      onChange={(e) => update("brandTextSize", e.target.value)}
                    />
                  </label>
                </div>
                <div className="field-row">
                  <div style={{ flex: 1 }}>
                    <DropdownSelect
                      label="Weight"
                      onChange={(value) => update("brandTextWeight", value as BrandTextWeight)}
                      options={brandWeightOptions}
                      searchable={false}
                      value={settings.brandTextWeight}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <DropdownSelect
                      label="Font"
                      onChange={(value) => update("brandTextFont", value)}
                      options={brandFontOptions}
                      searchable={false}
                      value={settings.brandTextFont}
                    />
                  </div>
                </div>
              </div>

              <DropdownSelect
                label="Header alignment"
                onChange={(value) => update("headerAlignment", value as Alignment)}
                options={ALIGNMENTS.map((alignment) => ({
                  label: alignment.charAt(0).toUpperCase() + alignment.slice(1),
                  value: alignment,
                }))}
                searchable={false}
                value={settings.headerAlignment}
              />
              <DropdownSelect
                label="Home hero text alignment"
                onChange={(value) => update("heroAlignment", value as Alignment)}
                options={ALIGNMENTS.map((alignment) => ({
                  label: alignment.charAt(0).toUpperCase() + alignment.slice(1),
                  value: alignment,
                }))}
                searchable={false}
                value={settings.heroAlignment}
              />
            </section>
          </div>

          <div className="admin-actions settings-form__actions" style={{ marginTop: "2rem" }}>
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save logo & layout"}
            </button>
          </div>
        </form>
      )}

      {settings && activeTab === "home" && (
        <form className="form form--wide" onSubmit={handleSave}>
          <div className="grid settings-home__layout">
            <section className="card">
              <h2>Home Page Rich Content</h2>
              <p className="lead">
                Use the block editor to add custom content below the hero section.
              </p>
              <PageDocumentEditor
                blocks={settings.homeBlocks}
                kbId="global"
                kbSlug="global"
                onChange={(blocks) => update("homeBlocks", blocks)}
              />
            </section>

            <section className="card">
              <h2>Knowledge Base List Section</h2>
              <p className="meta">Control how the list of published knowledge bases appears.</p>
              <label className="checkbox-inline" style={{ marginBottom: "1rem" }}>
                <input
                  type="checkbox"
                  checked={settings.showKbList}
                  onChange={(e) => update("showKbList", e.target.checked)}
                />
                <span>Show the list of published knowledge bases</span>
              </label>
              <label>
                <span className="meta">Section Heading</span>
                <input
                  className="input"
                  value={settings.kbListTitle}
                  onChange={(e) => update("kbListTitle", e.target.value)}
                />
              </label>

              <div className="field-group" style={{ marginTop: "1rem" }}>
                <span className="meta">Section heading style (leave any field at default to inherit)</span>
                <div className="field-row">
                  <label style={{ flex: 1 }}>
                    <span className="meta">Color</span>
                    <div className="theme-color__inputs">
                      <input
                        aria-label="Section heading color"
                        type="color"
                        value={settings.kbListTitleColor || "#1d1a1b"}
                        onChange={(e) => update("kbListTitleColor", e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Default"
                        value={settings.kbListTitleColor}
                        onChange={(e) => update("kbListTitleColor", e.target.value)}
                      />
                    </div>
                  </label>
                  <label style={{ flex: 1 }}>
                    <span className="meta">Size (e.g. 1.75rem or 28px)</span>
                    <input
                      className="input"
                      placeholder="Default"
                      value={settings.kbListTitleSize}
                      onChange={(e) => update("kbListTitleSize", e.target.value)}
                    />
                  </label>
                </div>
                <div className="field-row">
                  <div style={{ flex: 1 }}>
                    <DropdownSelect
                      label="Weight"
                      onChange={(value) => update("kbListTitleWeight", value as BrandTextWeight)}
                      options={brandWeightOptions}
                      searchable={false}
                      value={settings.kbListTitleWeight}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <DropdownSelect
                      label="Font"
                      onChange={(value) => update("kbListTitleFont", value)}
                      options={brandFontOptions}
                      searchable={false}
                      value={settings.kbListTitleFont}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="admin-actions settings-form__actions" style={{ marginTop: "2rem" }}>
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save home page content"}
            </button>
          </div>
        </form>
      )}

      {settings && activeTab === "styling" && (
        <section className="settings-styling">
          <div className="card settings-styling__intro">
            <h2>Global Default Styling</h2>
            <p className="lead">
              Adjust the default brand colors and fonts for the entire platform. Individual knowledge bases
              inherit these unless they define their own overrides.
            </p>
          </div>
          <ThemeEditor
            contentWidthField={
              <label className="theme-scale" title="Overall page width shared by all three columns (and the header/footer)">
                <span className="meta">Max page width</span>
                <input
                  type="range"
                  min={960}
                  max={2400}
                  step={20}
                  value={settings.contentWidth || 1720}
                  onChange={(e) => update("contentWidth", Number(e.target.value))}
                />
                <span className="theme-scale__value">{settings.contentWidth || 1720}px</span>
              </label>
            }
            dbEnabled={dbEnabled}
            initialTheme={settings.globalTheme || DEFAULT_THEME}
            kbTitle="Global Default"
            siteContentWidth={settings.contentWidth}
            onSave={async (newTheme) => {
              const nextSettings = { ...settings, globalTheme: newTheme };
              const res = await fetch("/api/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nextSettings),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || "Failed to save global theme");
              }
              const data = await res.json();
              setSettings(data.settings);
            }}
          />
        </section>
      )}
    </div>
  );
}
