"use client";

import { useEffect, useState } from "react";
import type { User, KnowledgeBase } from "@/lib/types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<User["role"]>("editor");

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) throw new Error("Failed to load users");
        const data = await res.json();
        setUsers(data.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading users");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, password: newPassword, fullName: newFullName, role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to create user");
      
      // Refresh list
      const updatedRes = await fetch("/api/admin/users");
      const data = await updatedRes.json();
      setUsers(data.users);
      
      setIsCreating(false);
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating user");
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete user");
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting user");
    }
  }

  if (loading) return <div className="page-shell"><p>Loading users...</p></div>;
  if (error) return <div className="page-shell"><p className="alert alert--error">{error}</p></div>;

  return (
    <div className="page-shell">
      <div className="admin-actions">
        <h1>User Management</h1>
        <button className="button" onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? "Cancel" : "Add User"}
        </button>
      </div>

      {isCreating && (
        <form className="form card" onSubmit={handleCreateUser} style={{ marginBottom: "2rem" }}>
          <h2>New User</h2>
          <label>
            <span className="meta">Email</span>
            <input 
              className="input" 
              type="email" 
              required 
              autoComplete="off"
              value={newEmail} 
              onChange={e => setNewEmail(e.target.value)} 
            />
          </label>
          <label>
            <span className="meta">Full Name</span>
            <input 
              className="input" 
              autoComplete="off"
              value={newFullName} 
              onChange={e => setNewFullName(e.target.value)} 
            />
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
              <button
                className="button button--ghost"
                onClick={() => setShowPassword(!showPassword)}
                type="button"
                style={{ minWidth: "4.5rem", padding: "0.5rem" }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <label>
            <span className="meta">Role</span>
            <select className="input" value={newRole} onChange={e => setNewRole(e.target.value as User["role"])}>
              <option value="editor">Editor (KB Scoped)</option>
              <option value="admin">Admin (All KBs)</option>
              <option value="owner">Owner (Full Access)</option>
            </select>
          </label>
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td><strong>{user.fullName || "—"}</strong></td>
                <td>{user.email}</td>
                <td>
                  <span className={`badge ${user.role === 'owner' ? 'badge--staff' : 'badge--section'}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <button className="button button--small button--ghost" onClick={() => handleDelete(user.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center" }} className="meta">No managed users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
