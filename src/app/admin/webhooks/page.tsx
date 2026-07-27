"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageLoader } from "@/components/PageLoader";
import type { WebhookEndpoint, WebhookEvent } from "@/lib/types";

const EVENT_OPTIONS: Array<{ value: WebhookEvent; label: string }> = [
  { value: "page.published", label: "Page published" },
  { value: "page.proposed", label: "Page proposed" },
  { value: "page.draft", label: "Page saved as draft" },
  { value: "review.overdue", label: "Review overdue" },
  { value: "asset.replaced", label: "Asset version activated" },
];

export default function AdminWebhooksPage() {
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["page.published"]);
  const [saving, setSaving] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  async function loadHooks() {
    setError(null);
    const response = await fetch("/api/admin/webhooks");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Could not load webhooks.");
    }
    setHooks(Array.isArray(data.hooks) ? data.hooks : []);
  }

  useEffect(() => {
    loadHooks()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load webhooks."))
      .finally(() => setLoading(false));
  }, []);

  function toggleEvent(event: WebhookEvent) {
    setEvents((current) =>
      current.includes(event) ? current.filter((value) => value !== event) : [...current, event],
    );
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setCreatedSecret(null);
    try {
      const response = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          secret: secret.trim() || undefined,
          events: events.length > 0 ? events : ["page.published"],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Could not create webhook.");
      }
      setUrl("");
      setSecret("");
      setEvents(["page.published"]);
      setCreatedSecret(typeof data.hook?.secret === "string" ? data.hook.secret : null);
      await loadHooks();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create webhook.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this webhook endpoint?")) {
      return;
    }
    setError(null);
    const response = await fetch(`/api/admin/webhooks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof data.message === "string" ? data.message : "Could not delete webhook.");
      return;
    }
    await loadHooks();
  }

  if (loading) {
    return <PageLoader label="Loading webhooks" />;
  }

  return (
    <div className="page-shell">
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>
      <h1>Webhooks</h1>
      <p className="lead">
        Register HTTPS endpoints to receive signed JSON payloads when pages change, reviews go overdue, or assets are
        replaced.
      </p>

      {error && <p className="alert alert--error">{error}</p>}
      {createdSecret && (
        <p className="alert alert--success">
          Webhook created. Signing secret: <code>{createdSecret}</code> — copy it now; it is not shown again.
        </p>
      )}

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>Add endpoint</h2>
        <form className="form" onSubmit={handleCreate}>
          <label>
            <span className="meta">HTTPS URL</span>
            <input
              className="input"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/kb-webhook"
              required
              type="url"
              value={url}
            />
          </label>
          <label>
            <span className="meta">Signing secret (optional — auto-generated if blank)</span>
            <input
              className="input"
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Leave blank to generate"
              value={secret}
            />
          </label>
          <fieldset>
            <legend className="meta">Events</legend>
            <div className="field-group">
              {EVENT_OPTIONS.map((option) => (
                <label className="checkbox-inline" key={option.value}>
                  <input
                    checked={events.includes(option.value)}
                    onChange={() => toggleEvent(option.value)}
                    type="checkbox"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="button" disabled={saving || !url.trim()} type="submit">
            {saving ? "Creating…" : "Create webhook"}
          </button>
        </form>
      </section>

      <section className="admin-panel" style={{ marginTop: "1.5rem" }}>
        <h2 className="admin-panel__title">Registered endpoints</h2>
        {hooks.length === 0 ? (
          <p className="admin-panel__empty">No webhooks configured yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Events</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {hooks.map((hook) => (
                  <tr key={hook.id}>
                    <td>
                      <code>{hook.url}</code>
                    </td>
                    <td>{hook.events.join(", ")}</td>
                    <td>{new Date(hook.createdAt).toLocaleString()}</td>
                    <td>
                      <button className="button button--small button--ghost" onClick={() => handleDelete(hook.id)} type="button">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="meta" style={{ marginTop: "1rem" }}>
          Payloads are POSTed as JSON with <code>x-kb-event</code> and <code>x-kb-signature</code> (HMAC-SHA256 of the
          body).
        </p>
      </section>
    </div>
  );
}
