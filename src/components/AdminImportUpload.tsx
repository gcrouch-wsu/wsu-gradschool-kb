"use client";

import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { DropdownSelect } from "@/components/DropdownSelect";
import { FileUploadPicker } from "@/components/FileUploadPicker";
import { PILOT_IMPORT_TARGETS } from "@/lib/pilot-imports";

export interface ImportKbOption {
  id: string;
  title: string;
}

const acceptedImportTypes = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const importMaxFileSize = 25 * 1024 * 1024;
const macroEnabledWordExtensions = [".docm", ".dotm", ".dot"];

function validateImportFile(file: File) {
  const fileName = file.name.toLowerCase();
  if (macroEnabledWordExtensions.some((extension) => fileName.endsWith(extension)) || file.type.includes("macroEnabled")) {
    return "Macro-enabled Word files are not allowed. Save as a plain .docx and try again.";
  }
  if (!fileName.endsWith(".docx") && file.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "Please upload a .docx file.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > importMaxFileSize) return "File is larger than 25 MB.";
  return null;
}

export function AdminImportUpload({ kbOptions }: { kbOptions: ImportKbOption[] }) {
  const router = useRouter();
  const fileFieldId = useId();
  const [kbId, setKbId] = useState(kbOptions[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(nextFile: File | null) {
    setError(null);
    setFile(nextFile);
  }

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
        <DropdownSelect
          label="Knowledge base"
          onChange={setKbId}
          options={kbOptions.map((kb) => ({
            icon: <BookOpen aria-hidden size={18} strokeWidth={1.75} />,
            label: kb.title,
            value: kb.id,
          }))}
          searchLabel="Search knowledge bases"
          value={kbId}
        />
        <FileUploadPicker
          accept={acceptedImportTypes}
          disabled={busy}
          file={file}
          helperText="Word document (.docx) up to 25 MB"
          id={fileFieldId}
          label="Word document (.docx)"
          onError={setError}
          onFileChange={handleFileChange}
          validateFile={validateImportFile}
        />
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
