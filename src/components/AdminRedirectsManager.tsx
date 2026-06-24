"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminRowMenu } from "@/components/admin/AdminRowMenu";
import type { KbRedirect } from "@/lib/types";

function redirectSearchFilter(redirect: KbRedirect, query: string) {
  return (
    redirect.fromPath.toLowerCase().includes(query) ||
    redirect.toPath.toLowerCase().includes(query) ||
    redirect.reason.toLowerCase().includes(query)
  );
}

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
        Public URLs use <code>/kb/{kbSlug}/…</code>. Map old Confluence-style paths to current page paths.
        Auto-redirects are also created when published pages move.
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
          <input className="input" onChange={(e) => setReason(e.target.value)} value={reason} />
        </label>
        <button className="button" disabled={busy || !fromPath || !toPath} type="submit">
          {busy ? "Saving…" : "Save redirect"}
        </button>
      </form>

      <h2 style={{ marginTop: "2rem" }}>Active redirects ({redirects.length})</h2>

      <AdminDataTable
        columns={[
          {
            id: "from",
            header: "From",
            cell: (redirect) => <code>/kb/{kbSlug}/{redirect.fromPath}</code>,
          },
          {
            id: "to",
            header: "To",
            cell: (redirect) => <code>/kb/{kbSlug}/{redirect.toPath}</code>,
          },
          {
            id: "reason",
            header: "Reason",
            cell: (redirect) => redirect.reason,
          },
        ]}
        emptyMessage="No manual redirects yet."
        getRowId={(redirect) => redirect.id}
        rows={redirects}
        searchFilter={redirectSearchFilter}
        searchPlaceholder="Search paths or reason…"
        actionsColumn={{
          header: "Actions",
          cell: (redirect) => (
            <AdminRowMenu
              disabled={busy}
              items={[
                {
                  danger: true,
                  label: "Delete",
                  onSelect: () => handleDelete(redirect.id),
                },
              ]}
              menuLabel={`Actions for ${redirect.fromPath}`}
              triggerContent={<MoreHorizontal aria-hidden size={18} strokeWidth={1.75} />}
              triggerLabel={`More options for ${redirect.fromPath}`}
            />
          ),
        }}
      />
    </div>
  );
}
