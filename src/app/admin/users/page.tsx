"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { KnowledgeBase, User } from "@/lib/types";
import KbAssignmentPicker from "@/components/KbAssignmentPicker";

interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: User["role"];
  createdAt: string;
  updatedAt: string;
  kbAssignments: string[];
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<User["role"]>("editor");
  const [newAssignments, setNewAssignments] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<User["role"]>("editor");
  const [editAssignments, setEditAssignments] = useState<string[]>([]);

  const loadData = useCallback(
    () =>
      Promise.all([fetch("/api/admin/users"), fetch("/api/admin/kbs")])
        .then(async ([usersRes, kbsRes]) => {
          if (!usersRes.ok) throw new Error("Failed to load users");
          const usersData = await usersRes.json();
          setUsers(usersData.users);
          if (kbsRes.ok) {
            const kbsData = await kbsRes.json();
            setKbs(kbsData.kbs ?? []);
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Error loading users"))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  function kbTitle(kbId: string) {
    return kbs.find((kb) => kb.id === kbId)?.title ?? kbId;
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          fullName: newFullName,
          role: newRole,
          kbAssignments: newRole === "editor" ? newAssignments : [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to create user");
      }
      await loadData();
      setIsCreating(false);
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setNewRole("editor");
      setNewAssignments([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating user");
    }
  }

  function startEdit(user: ManagedUser) {
    setEditingId(user.id);
    setEditRole(user.role);
    setEditAssignments(user.kbAssignments ?? []);
  }

  async function handleUpdateUser(userId: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole,
          kbAssignments: editRole === "editor" ? editAssignments : [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to update user");
      }
      await loadData();
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating user");
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete user");
      setUsers(users.filter((u) => u.id !== userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting user");
    }
  }

  if (loading) return <div className="page-shell"><p>Loading users…</p></div>;
  if (error) return <div className="page-shell"><p className="alert alert--error">{error}</p></div>;

  return (
    <div className="page-shell">
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>
      <div className="admin-actions">
        <h1>User Management</h1>
        <button className="button" onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? "Cancel" : "Add User"}
        </button>
      </div>
      <p className="meta">
        <strong>Owners</strong> and <strong>Admins</strong> can manage all knowledge bases. <strong>Editors</strong>{" "}
        can only edit the knowledge bases assigned to them below.
      </p>

      {isCreating && (
        <form className="form card" onSubmit={handleCreateUser} style={{ marginBottom: "2rem" }}>
          <h2>New User</h2>
          <label>
            <span className="meta">Email</span>
            <input className="input" type="email" required autoComplete="off" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </label>
          <label>
            <span className="meta">Full Name</span>
            <input className="input" autoComplete="off" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} />
          </label>
          <label>
            <span className="meta">Password</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                className="input"
                required
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button className="button button--ghost" onClick={() => setShowPassword(!showPassword)} type="button" style={{ minWidth: "4.5rem", padding: "0.5rem" }}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <label>
            <span className="meta">Role</span>
            <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as User["role"])}>
              <option value="editor">Editor (assigned KBs only)</option>
              <option value="admin">Admin (all KBs)</option>
              <option value="owner">Owner (full access)</option>
            </select>
          </label>
          {newRole === "editor" && (
            <KbAssignmentPicker kbs={kbs} selected={newAssignments} onChange={setNewAssignments} />
          )}
          <button className="button" type="submit">Create User</button>
        </form>
      )}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Knowledge bases</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isEditing = editingId === user.id;
              return (
                <tr key={user.id}>
                  <td><strong>{user.fullName || "—"}</strong></td>
                  <td>{user.email}</td>
                  <td>
                    {isEditing ? (
                      <select className="input" value={editRole} onChange={(e) => setEditRole(e.target.value as User["role"])}>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    ) : (
                      <span className={`badge ${user.role === "owner" ? "badge--staff" : "badge--section"}`}>{user.role}</span>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      editRole === "editor" ? (
                        <KbAssignmentPicker
                          kbs={kbs}
                          selected={editAssignments}
                          onChange={setEditAssignments}
                        />
                      ) : (
                        <span className="meta">All knowledge bases</span>
                      )
                    ) : user.role === "editor" ? (
                      user.kbAssignments.length > 0 ? (
                        <span className="meta">{user.kbAssignments.map(kbTitle).join(", ")}</span>
                      ) : (
                        <span className="meta" style={{ color: "var(--wsu-crimson)" }}>None assigned</span>
                      )
                    ) : (
                      <span className="meta">All knowledge bases</span>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="button button--small" onClick={() => handleUpdateUser(user.id)}>Save</button>
                        <button className="button button--small button--ghost" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="button button--small button--ghost" onClick={() => startEdit(user)}>Edit</button>
                        <button className="button button--small button--ghost" onClick={() => handleDelete(user.id)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center" }} className="meta">No managed users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
