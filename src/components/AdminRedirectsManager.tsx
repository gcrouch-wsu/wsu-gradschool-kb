"use client";

import { useState } from "react";
import type { KbRedirect } from "@/lib/types";

export function AdminRedirectsManager({
  kbId,
  kbSlug,
  initialRedirects,
}: {
  kbId: string;
  kbSlug: string;
  initialRedirects: KbRedirect[];
}) {
  const [redirects, setRedirects] = useState(initialRedirects);
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [reason, setReason] = useState("manual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId, fromPath, toPath, reason }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not create redirect.");
      }
      setRedirects((current) => {
        const without = current.filter((row) => row.fromPath !== data.redirect.fromPath);
        return [...without, data.redirect as KbRedirect].sort((a, b) =>
          a.fromPath.localeCompare(b.fromPath),
        );
      });
      setFromPath("");
      setToPath("");
      setMessage("Redirect saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create redirect.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(redirectId: string) {
    if (!window.confirm("Delete this redirect?")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/redirects/${redirectId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not delete redirect.");
      }
      setRedirects((current) => current.filter((row) => row.id !== redirectId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete redirect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="meta">
        Public URLs use <code>/kb/{kbSlug}/…</code>. Map old Confluence-style paths to current page
        paths. Auto-redirects are also created when published pages move.
      </p>
      {error && <p className="alert">{error}</p>}
      {message && <p className="alert alert--success">{message}</p>}

      <form className="form card" onSubmit={handleCreate} style={{ marginTop: "1rem" }}>
        <h2>Add redirect</h2>
        <label>
          <span className="meta">From path (old URL, no /kb/{kbSlug}/ prefix)</span>
          <input
            className="input"
            onChange={(e) => setFromPath(e.target.value)}
            placeholder="procedures/old-page-name"
            value={fromPath}
          />
        </label>
        <label>
          <span className="meta">To path (current page path)</span>
          <input
            className="input"
            onChange={(e) => setToPath(e.target.value)}
            placeholder="procedures/new-page-name"
            value={toPath}
          />
        </label>
        <label>
          <span className="meta">Reason (optional)</span>
          <input
            className="input"
            onChange={(e) => setReason(e.target.value)}
            value={reason}
          />
        </label>
        <button className="button" disabled={busy || !fromPath || !toPath} type="submit">
          {busy ? "Saving…" : "Save redirect"}
        </button>
      </form>

      <h2 style={{ marginTop: "2rem" }}>Active redirects ({redirects.length})</h2>
      {redirects.length === 0 ? (
        <p className="meta">No manual redirects yet.</p>
      ) : (
        <table className="content-table">
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">Reason</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {redirects.map((redirect) => (
              <tr key={redirect.id}>
                <td>
                  <code>/kb/{kbSlug}/{redirect.fromPath}</code>
                </td>
                <td>
                  <code>/kb/{kbSlug}/{redirect.toPath}</code>
                </td>
                <td>{redirect.reason}</td>
                <td>
                  <button
                    className="button button--ghost button--small"
                    disabled={busy}
                    onClick={() => handleDelete(redirect.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
