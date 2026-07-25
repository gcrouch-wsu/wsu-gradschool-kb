"use client";

import Link from "next/link";
import { useState } from "react";
import type { SourcedReviewFinding } from "@/lib/sourced-review";

function stateLabel(state: SourcedReviewFinding["state"]) {
  if (state === "changed") return "Content changed";
  if (state === "anchor_missing") return "Anchor missing";
  return "Source unreachable";
}

export function ReviewSourcedScan() {
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<number | null>(null);
  const [findings, setFindings] = useState<SourcedReviewFinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sourced-content/scan", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Scan failed.");
      }
      setChecked(typeof data.checked === "number" ? data.checked : 0);
      setFindings(Array.isArray(data.findings) ? (data.findings as SourcedReviewFinding[]) : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scan failed.");
      setFindings(null);
      setChecked(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: "1.5rem" }}>
      <h2>P&amp;P sourced content</h2>
      <p className="meta">
        Re-check imported Policies &amp; Procedures sections against their live sources. Unchanged
        sections stay quiet; changed, missing, or unreachable sources are listed for review. Refresh
        from the page editor — never auto-updated.
      </p>
      <p style={{ marginTop: "0.75rem" }}>
        <button className="button button--small" disabled={busy} onClick={runScan} type="button">
          {busy ? "Checking sources…" : "Check sourced content"}
        </button>
      </p>
      {error && <p className="error">{error}</p>}
      {checked !== null && findings && (
        <>
          <p className="meta" style={{ marginTop: "0.75rem" }}>
            Checked {checked} sourced section{checked === 1 ? "" : "s"}.{" "}
            {findings.length === 0
              ? "All reachable sources match the stored snapshot."
              : `${findings.length} need attention.`}
          </p>
          {findings.length > 0 && (
            <ul className="import-outline">
              {findings.map((row) => (
                <li key={`${row.pageId}-${row.blockId}`}>
                  <Link href={`/admin/pages/${row.pageId}`}>{row.pageTitle}</Link>
                  <span className="meta">
                    {" "}
                    · {stateLabel(row.state)} · {row.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
