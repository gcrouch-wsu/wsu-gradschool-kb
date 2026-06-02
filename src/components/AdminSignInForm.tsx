"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AdminSignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") || "/admin";
  const next =
    requestedNext === "/admin" || requestedNext.startsWith("/admin/") ? requestedNext : "/admin";
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

      router.replace(next);
      router.refresh();
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
