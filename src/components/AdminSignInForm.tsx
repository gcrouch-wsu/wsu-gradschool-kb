"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * Where to land after a successful sign-in.
 *
 * Previously restricted to `/admin*`, which meant signing in from an article always dumped
 * you on the admin dashboard with your place lost. Any same-origin path is now allowed so you
 * return to the page you were reading.
 *
 * This stays an open-redirect guard: the value must be a site-relative path. `//evil.test` and
 * `/\evil.test` are protocol-relative URLs that browsers resolve to another origin, and a
 * value containing a scheme is rejected outright.
 */
export function safeNextPath(requested: string | null | undefined): string {
  const value = (requested ?? "").trim();
  if (!value.startsWith("/")) {
    return "/admin";
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return "/admin";
  }
  if (/^\/[^/]*:/.test(value)) {
    return "/admin";
  }
  return value;
}

export function AdminSignInForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message || "Unable to sign in.");
        return;
      }

      // Full page load: the admin shell and the sign-in page use different
      // root layouts, so a soft navigation would keep the wrong shell.
      window.location.assign(next);
    } catch {
      setError("Unable to sign in.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        <span className="meta">Email</span>
        <input
          autoComplete="username"
          className="input"
          name="email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        <span className="meta">Password</span>
        <input
          autoComplete="current-password"
          className="input"
          name="password"
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && <div className="error">{error}</div>}
      <button className="button" disabled={isPending} type="submit">
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
