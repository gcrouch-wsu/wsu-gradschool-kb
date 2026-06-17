"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen } from "lucide-react";
import type { KnowledgeBase } from "@/lib/types";
import Link from "next/link";
import { DropdownSelect } from "@/components/DropdownSelect";

export default function NewPageScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedKbId = searchParams.get("kb");

  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [kbId, setKbId] = useState(preselectedKbId || "");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadKbs() {
      try {
        const res = await fetch("/api/admin/kbs");
        if (!res.ok) throw new Error("Failed to load KBs");
        const data = await res.json();
        setKbs(data.kbs);
        if (!kbId && data.kbs.length > 0) {
          setKbId(data.kbs[0].id);
        }
      } catch {
        setError("Error loading KBs");
      } finally {
        setLoading(false);
      }
    }
    loadKbs();
  }, [kbId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbId, title, slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create page");

      router.push(`/admin/pages/${data.pageId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="page-shell"><p>Loading...</p></div>;

  return (
    <div className="page-shell">
      <p className="eyebrow">Admin</p>
      <h1>New Page</h1>
      <p className="lead">Create a new page in a knowledge base.</p>

      <form className="form card" onSubmit={handleSubmit}>
        {error && <p className="alert alert--error">{error}</p>}

        <DropdownSelect
          label="Knowledge Base"
          onChange={setKbId}
          options={kbs.map((kb) => ({
            icon: <BookOpen aria-hidden size={18} strokeWidth={1.75} />,
            label: kb.title,
            searchText: kb.slug,
            value: kb.id,
          }))}
          searchLabel="Search knowledge bases"
          value={kbId}
        />

        <label>
          <span className="meta">Title</span>
          <input className="input" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. My New Guide" />
        </label>

        <label>
          <span className="meta">Slug (optional)</span>
          <input className="input" value={slug} onChange={e => setSlug(e.target.value)} placeholder="e.g. my-new-guide" />
        </label>

        <div className="admin-actions">
          <button className="button" disabled={busy || !kbId || !title} type="submit">
            {busy ? "Creating..." : "Create Page"}
          </button>
          <Link className="button button--ghost" href={`/admin/import?kb=${kbId}`}>
            Import from DOCX
          </Link>
          <Link className="button button--ghost" href="/admin/pages">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

