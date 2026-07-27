"use client";

import { useState } from "react";

interface UnusedAssetRow {
  assetId: string;
  title: string;
  slug: string;
  kbSlug: string;
}

export function ArchiveUnusedAssetsButton({ assets }: { assets: UnusedAssetRow[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (assets.length === 0) {
    return null;
  }

  async function archiveAll() {
    const confirmed = window.confirm(
      `Archive ${assets.length} unused asset${assets.length === 1 ? "" : "s"}? They can be restored later from the asset library.`,
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setMessage(null);
    let archived = 0;
    const failures: string[] = [];
    for (const asset of assets) {
      try {
        const response = await fetch(`/api/admin/assets/${asset.assetId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        });
        if (!response.ok) {
          failures.push(asset.title);
          continue;
        }
        archived += 1;
      } catch {
        failures.push(asset.title);
      }
    }
    setBusy(false);
    setMessage(
      failures.length === 0
        ? `Archived ${archived} unused asset${archived === 1 ? "" : "s"}. Refresh to update the list.`
        : `Archived ${archived}; failed for: ${failures.join(", ")}.`,
    );
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <button className="button button--small" disabled={busy} onClick={archiveAll} type="button">
        {busy ? "Archiving…" : `Archive all unused (${assets.length})`}
      </button>
      {message ? <p className="meta">{message}</p> : null}
    </div>
  );
}
