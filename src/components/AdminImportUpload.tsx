"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PILOT_IMPORT_TARGETS } from "@/lib/pilot-imports";

export interface ImportKbOption {
  id: string;
  title: string;
}

export function AdminImportUpload({ kbOptions }: { kbOptions: ImportKbOption[] }) {
  const router = useRouter();
  const [kbId, setKbId] = useState(kbOptions[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !kbId) {
      setError("Choose a knowledge base and .docx file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kbId", kbId);
      const response = await fetch("/api/admin/import/stage", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not stage the import.");
      }
      router.push(data.reviewUrl ?? `/admin/import/${data.stagedImportId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not stage the import.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-grid">
      <form className="form card" onSubmit={handleSubmit}>
        <h2>Start a new import</h2>
        <p className="meta">
          Upload a .docx file (up to 25 MB). It is parsed and saved as a <strong>staged import</strong>{" "}
          so you can review content and images before creating a draft page.
        </p>
        {error && <p className="alert">{error}</p>}
        <label>
          <span className="meta">Knowledge base</span>
          <select className="input" onChange={(e) => setKbId(e.target.value)} value={kbId}>
            {kbOptions.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="meta">Word document (.docx)</span>
          <input
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <button className="button" disabled={busy || !file} type="submit">
          {busy ? "Parsing and staging…" : "Upload and review"}
        </button>
      </form>

      <aside className="card import-preview">
        <h2>Pilot migration targets</h2>
        <p className="meta">Suggested pages for the Graduate School pilot (project spec §31).</p>
        <ul className="import-outline">
          {PILOT_IMPORT_TARGETS.map((target) => (
            <li key={target.title}>
              <strong>{target.title}</strong>
              <br />
              <span className="meta">
                Suggested parent: {target.suggestedParentPath || "top level"} — {target.note}
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
