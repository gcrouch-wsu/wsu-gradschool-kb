"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SiteSettings } from "@/lib/site-settings";

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
      <p className="lead">Control the copy shown on the public home page.</p>

      {error && <p className="alert alert--error">{error}</p>}
      {saved && <p className="alert">Saved. The home page will reflect your changes.</p>}

      {settings && (
        <form className="form card" onSubmit={handleSave} style={{ maxWidth: "48rem" }}>
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
          <button className="button" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}
    </div>
  );
}
