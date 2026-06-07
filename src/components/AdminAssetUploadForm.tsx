"use client";

import { useState } from "react";

type AssetUploadType = "file" | "video";

export function AdminAssetUploadForm({
  kbs,
  defaultKbId,
  lockKbId,
}: {
  kbs: { id: string; title: string }[];
  defaultKbId?: string;

  lockKbId?: string;
}) {
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
          Upload File
        </button>
        <button
          aria-pressed={uploadType === "video"}
          className="seg__btn"
          onClick={() => setUploadType("video")}
          type="button"
        >
          Link Video
        </button>
      </div>

      {!lockKbId && (
        <label>
          <span className="meta">Knowledge base</span>
          <select className="input" onChange={(e) => setKbId(e.target.value)} value={kbId}>
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        <span className="meta">Title (optional)</span>
        <input className="input" onChange={(e) => setTitle(e.target.value)} value={title} />
      </label>

      <label>
        <span className="meta">Description (optional)</span>
        <input
          className="input"
          onChange={(e) => setDescription(e.target.value)}
          value={description}
        />
      </label>

      {uploadType === "file" ? (
        <label>
          <span className="meta">File (PDF, Word, or text)</span>
          <input
            accept=".pdf,.doc,.docx,.txt,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
      ) : (
        <div className="field-row">
          <label>
            <span className="meta">Provider</span>
            <select
              className="input"
              onChange={(e) => setVideoProvider(e.target.value as any)}
              value={videoProvider}
            >
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="direct">Direct URL</option>
            </select>
          </label>
          <label style={{ flex: 2 }}>
            <span className="meta">URL or Embed ID</span>
            <input
              className="input"
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
