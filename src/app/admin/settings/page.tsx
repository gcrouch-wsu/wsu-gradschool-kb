"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { NavLink, SiteSettings } from "@/lib/site-settings";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load settings"))))
      .then((data) => setSettings(data.settings))
      .catch((err) => setError(err instanceof Error ? err.message : "Error loading settings"))
      .finally(() => setLoading(false));
  }, []);

  function update(field: keyof SiteSettings, value: string) {
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
      <p className="lead">Control site-wide content, including the home page, headers, and footers.</p>

      {error && <p className="alert alert--error">{error}</p>}
      {saved && <p className="alert">Saved. The changes will be reflected across the platform.</p>}

      {settings && (
        <form className="form" onSubmit={handleSave}>
          <section className="card" style={{ maxWidth: "48rem", marginBottom: "2rem" }}>
            <h2>Home Page Hero</h2>
            <label>
              <span className="meta">Home eyebrow (small label above the title)</span>
              <input
                className="input"
                value={settings.homeEyebrow}
                onChange={(e) => update("homeEyebrow", e.target.value)}
              />
            </label>
            <label>
              <span className="meta">Home title</span>
              <input
                className="input"
                value={settings.homeTitle}
                onChange={(e) => update("homeTitle", e.target.value)}
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

          <section className="card" style={{ maxWidth: "48rem", marginBottom: "2rem" }}>
            <h2>Global Header</h2>
            <div className="field-group">
              <span className="meta">Header Navigation Links</span>
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
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="button button--ghost" onClick={() => addLink("headerLinks")}>
                + Add Link
              </button>
            </div>
          </section>

          <section className="card" style={{ maxWidth: "48rem", marginBottom: "2rem" }}>
            <h2>Global Footer</h2>
            <label>
              <span className="meta">Footer Copyright/Brand Text</span>
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
              <span className="meta">Footer Navigation Links</span>
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
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="button button--ghost" onClick={() => addLink("footerLinks")}>
                + Add Link
              </button>
            </div>
          </section>

          <div className="admin-actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save all settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
