"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { AdminRowMenu } from "@/components/admin/AdminRowMenu";
import { DropdownSelect } from "@/components/DropdownSelect";
import KbAssignmentPicker from "@/components/KbAssignmentPicker";
import { ModalForm } from "@/components/Modal";
import { PageLoader } from "@/components/PageLoader";
import type { KnowledgeBase, User } from "@/lib/types";
interface ManagedUser {
  id: string;
  email: string;
  fullName: string;
  role: User["role"];
  createdAt: string;
  updatedAt: string;
  kbAssignments: string[];
}

function userSearchFilter(user: ManagedUser, query: string) {
  return (
    user.email.toLowerCase().includes(query) ||
    user.fullName.toLowerCase().includes(query) ||
    user.role.toLowerCase().includes(query)
  );
}

const userRoleOptions = [
  {
    description: "Can edit only assigned knowledge bases",
    label: "Editor",
    value: "editor",
  },
  {
    description: "Can manage all knowledge bases",
    label: "Admin",
    value: "admin",
  },
  {
    description: "Full platform access",
    label: "Owner",
    value: "owner",
  },
];

export default function AdminUsersPage() {  const [users, setUsers] = useState<ManagedUser[]>([]);
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
      setShowPassword(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating user");
    }
  }

  function closeCreateUserModal() {
    setIsCreating(false);
    setShowPassword(false);
    setNewEmail("");
    setNewPassword("");
    setNewFullName("");
    setNewRole("editor");
    setNewAssignments([]);
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

  if (loading) return <PageLoader label="Loading users" />;
  if (error) return <div className="page-shell"><p className="alert alert--error">{error}</p></div>;

  return (
    <div className="page-shell">
      <p className="meta">
        <Link href="/admin">← Back to admin</Link>
      </p>
      <div className="admin-actions admin-users__header">
        <h1>User Management</h1>
        <button className="button" onClick={() => setIsCreating(true)} type="button">
          Add User
        </button>
      </div>
      <p className="meta">
        <strong>Owners</strong> and <strong>Admins</strong> can manage all knowledge bases. <strong>Editors</strong>{" "}
        can only edit the knowledge bases assigned to them below.
      </p>

      {isCreating && (
        <ModalForm
          description="Create an admin user and choose whether they can manage all knowledge bases or only assigned ones."
          onClose={closeCreateUserModal}
          onSubmit={handleCreateUser}
          submitLabel="Create User"
          title="New User"
          width="lg"
        >
          <label>
            <span className="meta">Email</span>
            <input
              autoComplete="off"
              className="input"
              data-autofocus
              required
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </label>
          <label>
            <span className="meta">Full Name</span>
            <input
              autoComplete="off"
              className="input"
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
            />
          </label>
          <label>
            <span className="meta">Password</span>
            <div className="modal-form__inline-field">
              <input
                className="input"
                required
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden size={18} strokeWidth={1.8} />
                ) : (
                  <Eye aria-hidden size={18} strokeWidth={1.8} />
                )}
              </button>
            </div>
          </label>
          <DropdownSelect
            label="Role"
            onChange={(value) => setNewRole(value as User["role"])}
            options={userRoleOptions}
            searchable={false}
            value={newRole}
          />
          {newRole === "editor" && (
            <KbAssignmentPicker kbs={kbs} selected={newAssignments} onChange={setNewAssignments} />
          )}
        </ModalForm>
      )}

      <AdminDataTable
        columns={[
          {
            id: "name",
            header: "Name",
            cell: (user) => <strong>{user.fullName || "—"}</strong>,
          },
          {
            id: "email",
            header: "Email",
            cell: (user) => user.email,
          },
          {
            id: "role",
            header: "Role",
            cell: (user) => {
              const isEditing = editingId === user.id;
              if (isEditing) {
                return (
                  <select
                    className="input"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as User["role"])}
                  >
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                );
              }
              return (
                <span className={`badge ${user.role === "owner" ? "badge--staff" : "badge--section"}`}>
                  {user.role}
                </span>
              );
            },
          },
          {
            id: "kbs",
            header: "Knowledge bases",
            cell: (user) => {
              const isEditing = editingId === user.id;
              if (isEditing) {
                return editRole === "editor" ? (
                  <KbAssignmentPicker kbs={kbs} selected={editAssignments} onChange={setEditAssignments} />
                ) : (
                  <span className="meta">All knowledge bases</span>
                );
              }
              if (user.role === "editor") {
                return user.kbAssignments.length > 0 ? (
                  <span className="meta">{user.kbAssignments.map(kbTitle).join(", ")}</span>
                ) : (
                  <span className="meta" style={{ color: "var(--wsu-crimson)" }}>
                    None assigned
                  </span>
                );
              }
              return <span className="meta">All knowledge bases</span>;
            },
          },
        ]}
        emptyMessage="No managed users found."
        getRowId={(user) => user.id}
        rows={users}
        searchFilter={userSearchFilter}
        searchPlaceholder="Search by name, email, or role…"
        actionsColumn={{
          header: "Actions",
          cell: (user) => {
            const isEditing = editingId === user.id;
            if (isEditing) {
              return (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="button button--small" onClick={() => handleUpdateUser(user.id)} type="button">
                    Save
                  </button>
                  <button className="button button--small button--ghost" onClick={() => setEditingId(null)} type="button">
                    Cancel
                  </button>
                </div>
              );
            }
            return (
              <AdminRowMenu
                items={[
                  {
                    label: "Edit",
                    onSelect: () => startEdit(user),
                  },
                  { divider: true, label: "" },
                  {
                    danger: true,
                    label: "Delete",
                    onSelect: () => handleDelete(user.id),
                  },
                ]}
                menuLabel={`Actions for ${user.email}`}
                triggerContent={<MoreHorizontal aria-hidden size={18} strokeWidth={1.75} />}
                triggerLabel={`More options for ${user.email}`}
              />
            );
          },
        }}
      />    </div>
  );
}
