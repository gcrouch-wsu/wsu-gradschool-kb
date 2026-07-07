"use client";

import { useState } from "react";
import { FileUploadPicker } from "@/components/FileUploadPicker";
import type { AssetUsage, AssetVersion } from "@/lib/types";

export function AdminAssetDetailPanel({
  assetId,
  assetStatus: initialStatus,
  canDelete,
  versions: initialVersions,
  usages: initialUsages,
  publicUrl: initialPublicUrl,
}: {
  assetId: string;
  assetStatus: string;
  canDelete: boolean;
  versions: AssetVersion[];
  usages: AssetUsage[];
  publicUrl: string | null;
}) {
  const [versions, setVersions] = useState(initialVersions);
  const [usages, setUsages] = useState(initialUsages);
  const [assetStatus, setAssetStatus] = useState(initialStatus);
  const [publicUrl, setPublicUrl] = useState(initialPublicUrl);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const draft = versions.find((version) => version.status === "draft");
  const currentMimeType = versions[0]?.mimeType?.toLowerCase() ?? "";
  const isImageAsset = currentMimeType.startsWith("image/");
  const acceptedReplacementTypes = isImageAsset
    ? ".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/jpg,image/gif,image/webp"
    : ".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

  function validateReplacementFile(nextFile: File) {
    const normalizedType = nextFile.type.toLowerCase();
    const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
    const allowedDocumentTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ]);
    const isAllowed = isImageAsset
      ? allowedImageTypes.has(normalizedType)
      : allowedDocumentTypes.has(normalizedType);
    if (!isAllowed) {
      return isImageAsset
        ? "Choose an image file (PNG, JPG, GIF, or WEBP)."
        : "Choose a PDF, Word, or text file.";
    }
    if (nextFile.size > 25 * 1024 * 1024) {
      return "Choose a file that is 25 MB or smaller.";
    }
    return null;
  }

  async function handleReplace(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/admin/assets/${assetId}/replace`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Replace failed.");
      }
      setVersions((current) => [...current, data.draft as AssetVersion]);
      setUsages(data.usages ?? usages);
      setMessage(data.message ?? "Draft replacement ready.");
      setFile(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Replace failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(status: "active" | "archived") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/assets/${assetId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not update asset status.");
      }
      setAssetStatus(status);
      setPublicUrl(data.url ?? null);
      setMessage(
        status === "archived"
          ? "Asset archived. Public URL no longer serves this file."
          : "Asset restored. Public URL is live again.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update status.");
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate(versionId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/assets/${assetId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Activation failed.");
      }
      setVersions((current) =>
        current.map((version) => {
          if (version.id === versionId) {
            return { ...version, status: "active" };
          }
          if (version.status === "active") {
            return { ...version, status: "replaced" };
          }
          return version;
        }),
      );
      setUsages(data.usages ?? usages);
      setAssetStatus("active");
      setPublicUrl(data.url ?? publicUrl);
      setMessage("New version is now live at the same public URL.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const confirmation = prompt(
      "Permanently delete this asset? This cannot be undone. Only archived, unreferenced assets can be deleted. To confirm, type \"DELETE\" below.",
    );
    if (confirmation !== "DELETE") {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/assets/${assetId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Could not delete asset.");
      }
      window.location.assign("/admin/assets");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete asset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-grid">
      <section className="card">
        <div className="asset-replace__header">
          <h2>Replace file</h2>
          {assetStatus === "archived" ? (
            <button
              className="button asset-replace__status-action"
              disabled={busy}
              onClick={() => handleStatusChange("active")}
              type="button"
            >
              {busy ? "Restoring..." : "Restore (make active)"}
            </button>
          ) : (
            <button
              className="button button--ghost asset-replace__status-action"
              disabled={busy}
              onClick={() => handleStatusChange("archived")}
              type="button"
            >
              {busy ? "Archiving..." : "Archive asset"}
            </button>
          )}
        </div>
        <p className="meta">
          Upload a replacement. It is saved as a draft version until you activate it. The public
          slug does not change.
        </p>
        <p className="meta">
          Status: <strong>{assetStatus}</strong>
        </p>
        {publicUrl && (
          <p className="meta">
            Public URL: <a href={publicUrl}>{publicUrl}</a>
          </p>
        )}
        <div className="admin-actions asset-replace__actions">
          {canDelete && assetStatus === "archived" && usages.length === 0 && (
            <button
              className="button button--ghost asset-replace__delete-action"
              disabled={busy}
              onClick={handleDelete}
              style={{ color: "var(--wsu-crimson)" }}
              type="button"
            >
              {busy ? "Deleting..." : "Delete permanently"}
            </button>
          )}
        </div>
        {error && <p className="alert">{error}</p>}
        {message && <p className="alert">{message}</p>}
        <form className="form" onSubmit={handleReplace}>
          <FileUploadPicker
            accept={acceptedReplacementTypes}
            file={file}
            helperText={
              isImageAsset
                ? "PNG, JPG, GIF, or WEBP up to 25 MB"
                : "PDF, Word, or text document up to 25 MB"
            }
            id={`replacement-file-${assetId}`}
            label="Replacement file"
            onError={setError}
            onFileChange={setFile}
            validateFile={validateReplacementFile}
          />
          <button className="button" disabled={busy || !file} type="submit">
            {busy ? "Uploading…" : "Upload draft replacement"}
          </button>
        </form>
        {draft && (
          <p style={{ marginTop: "1rem" }}>
            <button
              className="button"
              disabled={busy}
              onClick={() => handleActivate(draft.id)}
              type="button"
            >
              Activate draft v{draft.versionNumber}
            </button>
          </p>
        )}
      </section>

      <aside className="card import-preview">
        <h2>Usage ({usages.length})</h2>
        {usages.length === 0 ? (
          <p className="meta">This asset is not referenced on any page yet.</p>
        ) : (
          <ul className="import-outline">
            {usages.map((usage, index) => (
              <li key={`${usage.pageId}-${usage.usageType}-${index}`}>
                <a href={`/admin/pages/${usage.pageId}`}>{usage.pageTitle}</a> ({usage.pageStatus}
                ) — {usage.usageType.replace("_", " ")}
              </li>
            ))}
          </ul>
        )}

        <h3>Version history</h3>
        <ol className="import-outline">
          {versions.map((version) => (
            <li key={version.id}>
              v{version.versionNumber} — {version.status} — {version.originalFilename}
              {version.status === "draft" && (
                <>
                  {" "}
                  <button
                    className="button button--ghost"
                    disabled={busy}
                    onClick={() => handleActivate(version.id)}
                    type="button"
                  >
                    Activate
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
