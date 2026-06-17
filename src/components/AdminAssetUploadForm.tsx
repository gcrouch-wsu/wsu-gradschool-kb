"use client";

import { BookOpen, FileText, UploadCloud, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { DropdownSelect } from "@/components/DropdownSelect";

type AssetUploadType = "file" | "video";

const acceptedDocumentTypes = ".pdf,.doc,.docx,.txt,application/pdf,text/plain";
const maxFileSize = 25 * 1024 * 1024;

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedDocument(file: File) {
  const fileName = file.name.toLowerCase();
  return [".pdf", ".doc", ".docx", ".txt"].some((extension) => fileName.endsWith(extension));
}

export function AdminAssetUploadForm({
  kbs,
  defaultKbId,
  lockKbId,
}: {
  kbs: { id: string; title: string }[];
  defaultKbId?: string;
  lockKbId?: string;
}) {
  const formId = useId();
  const titleFieldId = `${formId}-title`;
  const descriptionFieldId = `${formId}-description`;
  const fileFieldId = `${formId}-file`;
  const videoUrlFieldId = `${formId}-video-url`;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kbId, setKbId] = useState(lockKbId ?? defaultKbId ?? kbs[0]?.id ?? "");
  const [uploadType, setUploadType] = useState<AssetUploadType>("file");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoProvider, setVideoProvider] = useState<"youtube" | "vimeo" | "direct">("youtube");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  function handleSelectedFile(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!isAcceptedDocument(nextFile)) {
      setError("Choose a PDF, Word, or text file.");
      setFile(null);
      return;
    }
    if (nextFile.size > maxFileSize) {
      setError("Choose a file that is 25 MB or smaller.");
      setFile(null);
      return;
    }
    setError(null);
    setCreatedUrl(null);
    setFile(nextFile);
  }

  function clearSelectedFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (uploadType === "file" && !file) {
      setError("Choose a file to upload.");
      return;
    }
    if (uploadType === "video" && !videoUrl) {
      setError("Enter a video URL or ID.");
      return;
    }
    if (!kbId) {
      setError("Choose a knowledge base.");
      return;
    }

    setBusy(true);
    setError(null);
    setCreatedUrl(null);

    try {
      if (uploadType === "file") {
        const formData = new FormData();
        formData.append("file", file!);
        formData.append("kbId", kbId);
        if (title.trim()) formData.append("title", title.trim());
        if (description.trim()) formData.append("description", description.trim());

        const response = await fetch("/api/admin/assets/documents", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Upload failed.");
        const assetId = data.asset?.id;
        setCreatedUrl(assetId ? `/admin/assets/${assetId}` : data.url ?? null);
      } else {
        const response = await fetch("/api/admin/assets/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kbId,
            title: title.trim() || "Untitled Video",
            description: description.trim(),
            url: videoUrl,
            provider: videoProvider,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Failed to save video link.");
        setCreatedUrl(`/admin/assets/${data.asset.id}`);
      }

      setFile(null);
      setVideoUrl("");
      setTitle("");
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {error && <p className="alert alert--error">{error}</p>}
      {createdUrl && (
        <p className="alert alert--success">
          Asset created. <a href={createdUrl}>Open asset</a>
        </p>
      )}

      <div className="seg" style={{ marginBottom: "1rem" }}>
        <button
          aria-pressed={uploadType === "file"}
          className="seg__btn"
          onClick={() => setUploadType("file")}
          type="button"
        >
          Upload file
        </button>
        <button
          aria-pressed={uploadType === "video"}
          className="seg__btn"
          onClick={() => setUploadType("video")}
          type="button"
        >
          Link video
        </button>
      </div>

      {!lockKbId && (
        <DropdownSelect
          label="Knowledge base"
          onChange={setKbId}
          options={kbs.map((kb) => ({
            icon: <BookOpen aria-hidden size={18} strokeWidth={1.75} />,
            label: kb.title,
            value: kb.id,
          }))}
          searchLabel="Search knowledge bases"
          value={kbId}
        />
      )}

      <label htmlFor={titleFieldId}>
        <span className="meta">Title (optional)</span>
        <input className="input" id={titleFieldId} onChange={(e) => setTitle(e.target.value)} value={title} />
      </label>

      <label htmlFor={descriptionFieldId}>
        <span className="meta">Description (optional)</span>
        <input
          className="input"
          id={descriptionFieldId}
          onChange={(e) => setDescription(e.target.value)}
          value={description}
        />
      </label>

      {uploadType === "file" ? (
        <div className="asset-file-picker">
          <span className="meta">File</span>
          <label
            className="asset-file-picker__dropzone"
            htmlFor={fileFieldId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleSelectedFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              accept={acceptedDocumentTypes}
              className="asset-file-picker__input"
              id={fileFieldId}
              onChange={(event) => handleSelectedFile(event.target.files?.[0] ?? null)}
              ref={fileInputRef}
              type="file"
            />
            <span className="asset-file-picker__icon" aria-hidden>
              {file ? <FileText size={24} strokeWidth={1.75} /> : <UploadCloud size={24} strokeWidth={1.75} />}
            </span>
            <span className="asset-file-picker__content">
              <span className="asset-file-picker__title">{file ? file.name : "Choose a file or drag it here"}</span>
              <span className="asset-file-picker__hint">
                {file ? `${formatFileSize(file.size)} selected` : "PDF, Word, or text document up to 25 MB"}
              </span>
            </span>
            <span className="asset-file-picker__action">{file ? "Choose another" : "Browse files"}</span>
          </label>
          {file && (
            <button className="asset-file-picker__clear" onClick={clearSelectedFile} type="button">
              <X aria-hidden size={16} strokeWidth={1.75} />
              Remove selected file
            </button>
          )}
        </div>
      ) : (
        <div className="field-row">
          <DropdownSelect
            label="Provider"
            onChange={(nextValue) => setVideoProvider(nextValue as "youtube" | "vimeo" | "direct")}
            options={[
              { label: "YouTube", value: "youtube" },
              { label: "Vimeo", value: "vimeo" },
              { label: "Direct URL", value: "direct" },
            ]}
            searchable={false}
            value={videoProvider}
          />
          <label htmlFor={videoUrlFieldId} style={{ flex: 2 }}>
            <span className="meta">URL or embed ID</span>
            <input
              className="input"
              id={videoUrlFieldId}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder={videoProvider === "direct" ? "https://..." : "e.g. dQw4w9WgXcQ"}
              value={videoUrl}
            />
          </label>
        </div>
      )}

      <button className="button" disabled={busy} type="submit">
        {busy ? "Saving…" : uploadType === "file" ? "Upload document" : "Save video link"}
      </button>
    </form>
  );
}
