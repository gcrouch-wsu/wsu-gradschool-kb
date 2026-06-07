"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageDocumentEditor } from "@/components/PageDocumentEditor";
import { ThemeEditor } from "@/components/ThemeEditor";
import { isDatabaseEnabled } from "@/lib/db";
import { DEFAULT_THEME } from "@/lib/kb-theme";
import type { NavLink, SiteSettings } from "@/lib/site-settings";
import type { ContentBlock } from "@/lib/types";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "home" | "styling">("general");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load settings"))))
      .then((data) => setSettings(data.settings))
      .catch((err) => setError(err instanceof Error ? err.message : "Error loading settings"))
      .finally(() => setLoading(false));
  }, []);

  function update(field: keyof SiteSettings, value: any) {
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

  if (loading) return <div className="page-shell"><p>Loading settings…</p></div>;

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
        <form className="form" onSubmit={handleSave}>
          <div className="grid grid--two">
            <section className="card">
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

            <section className="card">
              <h2>Site Header</h2>
              <div className="field-group">
                <span className="meta">Navigation Links</span>
                {settings.headerLinks.map((link, i) => (
                  <div key={i} className="field-row">
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
                    <button type="button" className="button button--ghost" onClick={() => removeLink("headerLinks", i)}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="button button--ghost" onClick={() => addLink("headerLinks")}>
                  + Add Link
                </button>
              </div>
            </section>
          </div>

          <section className="card" style={{ marginTop: "2rem" }}>
            <h2>Site Footer</h2>
            <div className="grid grid--two">
              <div>
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
              </div>
              <div className="field-group">
                <span className="meta">Footer Links</span>
                {settings.footerLinks.map((link, i) => (
                  <div key={i} className="field-row">
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
                    <button type="button" className="button button--ghost" onClick={() => removeLink("footerLinks", i)}>
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="button button--ghost" onClick={() => addLink("footerLinks")}>
                  + Add Link
                </button>
              </div>
            </div>
          </section>

          <div className="admin-actions" style={{ marginTop: "2rem" }}>
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save general settings"}
            </button>
          </div>
        </form>
      )}

      {settings && activeTab === "home" && (
        <form className="form" onSubmit={handleSave}>
          <section className="card" style={{ marginBottom: "2rem" }}>
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
          </section>

          <div className="admin-actions" style={{ marginTop: "2rem" }}>
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save home page content"}
            </button>
          </div>
        </form>
      )}

      {settings && activeTab === "styling" && (
        <section>
          <div className="card" style={{ marginBottom: "2rem" }}>
            <h2>Global Default Styling</h2>
            <p className="lead">
              Adjust the default brand colors and fonts for the entire platform. Individual knowledge bases
              inherit these unless they define their own overrides.
            </p>
          </div>
          <ThemeEditor
            dbEnabled={isDatabaseEnabled()}
            initialTheme={settings.globalTheme || DEFAULT_THEME}
            kbTitle="Global Default"
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
