"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminRowMenu } from "@/components/admin/AdminRowMenu";
import { Modal } from "@/components/Modal";
import type { KbStatus, KnowledgeBase } from "@/lib/types";

function kbSearchFilter(kb: KnowledgeBase, query: string) {
  return (
    kb.title.toLowerCase().includes(query) ||
    kb.slug.toLowerCase().includes(query) ||
    kb.description.toLowerCase().includes(query) ||
    kb.status.toLowerCase().includes(query)
  );
}

export default function AdminKbsPage() {
  const router = useRouter();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<KnowledgeBase>>({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const res = await fetch("/api/admin/kbs");
      if (!res.ok) throw new Error("Failed to load KBs");
      const data = await res.json();
      setKbs(data.kbs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading KBs");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/kbs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, description: newDescription, slug: newSlug, status: "draft" }),
      });
      if (!res.ok) throw new Error("Failed to create KB");

      await loadData();
      setIsCreating(false);
      setNewTitle("");
      setNewDescription("");
      setNewSlug("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating KB");
    }
  }

  function closeCreateModal() {
    setIsCreating(false);
    setNewTitle("");
    setNewDescription("");
    setNewSlug("");
  }

  async function handleUpdate(kbId: string) {
    try {
      const res = await fetch(`/api/admin/kbs/${kbId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error("Failed to update KB");

      await loadData();
      setEditingId(null);
      setEditData({});
      setMessage("Knowledge base updated.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating KB");
    }
  }

  async function handleStatusChange(kbId: string, status: Extract<KbStatus, "draft" | "published">) {
    setStatusBusyId(kbId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/kbs/${kbId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to update KB status");
      }
      await loadData();
      setMessage(status === "published" ? "Knowledge base published." : "Knowledge base unpublished.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating KB status");
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleDelete(kbId: string, title: string) {
    const confirmation = prompt(
      `Are you sure you want to delete "${title}"? This cannot be undone. All pages and assets within this KB will be permanently removed. To confirm, type "DELETE" below.`,
    );
    if (confirmation !== "DELETE") return;

    try {
      const res = await fetch(`/api/admin/kbs/${kbId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete KB");
      }
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting KB");
    }
  }

  if (loading) {
    return (
      <div className="page-shell">
        <p>Loading knowledge bases...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-shell">
        <p className="alert alert--error">{error}</p>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>
      <div className="admin-actions admin-kbs__header">
        <h1>Knowledge Base Management</h1>
        <button className="button" onClick={() => setIsCreating(true)} type="button">
          Create KB
        </button>
      </div>

      <p className="alert alert--info">
        Published pages are not enough for the public Knowledge Bases list. The knowledge base itself must also be
        published.
      </p>
      {message && <p className="alert alert--success">{message}</p>}

      {isCreating && (
        <Modal
          description="Create a draft knowledge base. You can publish it after adding pages and reviewing the setup."
          onClose={closeCreateModal}
          title="New Knowledge Base"
        >
          <form className="form" onSubmit={handleCreate}>
            <label>
              <span className="meta">Title</span>
              <input
                className="input"
                data-autofocus
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </label>
            <label>
              <span className="meta">URL Slug (optional)</span>
              <input
                className="input"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="e.g. graduate-school"
              />
            </label>
            <label>
              <span className="meta">Description</span>
              <textarea
                className="input"
                rows={3}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </label>
            <button className="button" type="submit">
              Create KB
            </button>
          </form>
        </Modal>
      )}

      <AdminDataTable
        columns={[
          {
            id: "title",
            header: "Title & Slug",
            cell: (kb) => {
              const isEditing = editingId === kb.id;
              if (isEditing) {
                return (
                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    <input
                      className="input"
                      value={editData.title ?? kb.title}
                      onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                    />
                    <input
                      className="input"
                      value={editData.slug ?? kb.slug}
                      onChange={(e) => setEditData({ ...editData, slug: e.target.value })}
                    />
                    <textarea
                      className="input"
                      value={editData.description ?? kb.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    />
                  </div>
                );
              }
              return (
                <>
                  <strong>{kb.title}</strong>
                  <div className="meta">/{kb.slug}</div>
                  <div className="meta" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                    {kb.description}
                  </div>
                </>
              );
            },
          },
          {
            id: "status",
            header: "Status",
            cell: (kb) => {
              const isEditing = editingId === kb.id;
              if (isEditing) {
                return (
                  <select
                    className="input"
                    value={editData.status ?? kb.status}
                    onChange={(e) => setEditData({ ...editData, status: e.target.value as KbStatus })}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                );
              }
              return (
                <>
                  <span className={`badge ${kb.status === "published" ? "badge--section" : "badge--draft"}`}>
                    {kb.status}
                  </span>
                  {kb.status !== "published" && (
                    <div className="meta" style={{ marginTop: "0.5rem" }}>
                      Hidden from public KB list
                    </div>
                  )}
                </>
              );
            },
          },
          {
            id: "updated",
            header: "Updated",
            cell: (kb) => kb.updatedOn,
          },
        ]}
        emptyMessage="No knowledge bases match your search."
        getRowId={(kb) => kb.id}
        rows={kbs}
        searchFilter={kbSearchFilter}
        searchPlaceholder="Search by title, slug, or description…"
        actionsColumn={{
          header: "Actions",
          cell: (kb) => {
            const isEditing = editingId === kb.id;
            if (isEditing) {
              return (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button className="button button--small" onClick={() => handleUpdate(kb.id)} type="button">
                    Save
                  </button>
                  <button
                    className="button button--small button--ghost"
                    onClick={() => {
                      setEditingId(null);
                      setEditData({});
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              );
            }
            return (
              <AdminRowMenu
                disabled={statusBusyId === kb.id}
                items={[
                  ...(kb.status === "published"
                    ? [
                        {
                          label: "View public",
                          onSelect: () => router.push(`/kb/${kb.slug}`),
                        },
                        {
                          label: statusBusyId === kb.id ? "Updating..." : "Unpublish",
                          disabled: statusBusyId === kb.id,
                          onSelect: () => handleStatusChange(kb.id, "draft"),
                        },
                      ]
                    : [
                        {
                          label: statusBusyId === kb.id ? "Publishing..." : "Publish KB",
                          disabled: statusBusyId === kb.id,
                          onSelect: () => handleStatusChange(kb.id, "published"),
                        },
                      ]),
                  { divider: true, label: "" },
                  {
                    label: "Edit",
                    onSelect: () => {
                      setEditingId(kb.id);
                      setEditData({});
                    },
                  },
                  {
                    label: "Pages",
                    onSelect: () => router.push(`/admin/pages?kb=${kb.id}`),
                  },
                  {
                    label: "Styles",
                    onSelect: () => router.push(`/admin/kbs/${kb.id}/styles`),
                  },
                  { divider: true, label: "" },
                  {
                    danger: true,
                    label: "Delete",
                    onSelect: () => handleDelete(kb.id, kb.title),
                  },
                ]}
                menuLabel={`Actions for ${kb.title}`}
                triggerContent={<MoreHorizontal aria-hidden size={18} strokeWidth={1.75} />}
                triggerLabel={`More options for ${kb.title}`}
              />
            );
          },
        }}
      />
    </div>
  );
}
