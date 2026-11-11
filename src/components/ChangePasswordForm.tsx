"use client";

import { useState } from "react";
import { NewPasswordField } from "@/components/NewPasswordField";
import { PasswordInput } from "@/components/PasswordInput";
import { validatePassword } from "@/lib/password-policy";

export function ChangePasswordForm({ backHref, email }: { backHref: string; email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newVisible, setNewVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const problem = validatePassword(newPassword, { email });
    if (problem) {
      setError(problem);
      return;
    }
    setIsPending(true);
    try {
      const response = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message || "Unable to change password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setDone(true);
    } catch {
      setError("Unable to change password.");
    } finally {
      setIsPending(false);
    }
  }

  if (done) {
    return (
      <div className="flow">
        <p className="alert alert--success" role="status">
          Password changed. Any other browsers signed in to this account have been signed out.
        </p>
        <p>
          {/* Plain anchor: /admin uses a different root shell. */}
          <a className="button" href={backHref}>
            Continue
          </a>
        </p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {/* Lets password managers associate the new password with the right account. */}
      <input autoComplete="username" hidden readOnly type="email" value={email} />
      <PasswordInput
        autoComplete="current-password"
        label="Current password"
        onChange={setCurrentPassword}
        value={currentPassword}
      />
      <NewPasswordField
        context={{ email }}
        label="New password"
        onChange={setNewPassword}
        onVisibleChange={setNewVisible}
        value={newPassword}
        visible={newVisible}
      />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="password-field__actions">
        <button className="button" disabled={isPending} type="submit">
          {isPending ? "Saving..." : "Change password"}
        </button>
        <a className="button button--ghost" href={backHref}>
          Cancel
        </a>
      </div>
    </form>
  );
}
