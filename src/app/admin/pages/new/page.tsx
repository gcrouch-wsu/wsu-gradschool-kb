"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, FileText } from "lucide-react";
import type { KnowledgeBase, PageStatus, PageVisibility } from "@/lib/types";
import Link from "next/link";
import { DropdownSelect } from "@/components/DropdownSelect";
import { PageLoader } from "@/components/PageLoader";

interface ParentPageOption {
  id: string;
  title: string;
  path: string[];
  status: PageStatus;
  visibility: PageVisibility;
}

export default function NewPageScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedKbId = searchParams.get("kb");

  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [kbId, setKbId] = useState(preselectedKbId || "");
  const [parentPages, setParentPages] = useState<ParentPageOption[]>([]);
  const [parentPageId, setParentPageId] = useState("");
  const [nodeKind, setNodeKind] = useState<"page" | "group" | "link">("page");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNewTab, setLinkNewTab] = useState(false);
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

  useEffect(() => {
    if (!kbId) {
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/excerpt-sources?kb=${encodeURIComponent(kbId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((data: { pages?: ParentPageOption[] }) => {
        if (!cancelled) {
          setParentPages(data.pages ?? []);
          setParentPageId("");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kbId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const parent = parentPages.find((page) => page.id === parentPageId);
      const res = await fetch("/api/admin/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kbId,
          title,
          slug,
          parentPath: parent ? parent.path : [],
          nodeKind,
          linkUrl: nodeKind === "link" ? linkUrl : "",
          linkNewTab: nodeKind === "link" ? linkNewTab : false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create page");

      router.push(nodeKind === "page" ? `/admin/pages/${data.pageId}` : "/admin/pages");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoader label="Loading page form" />;

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

        <DropdownSelect
          label="Parent page (optional)"
          onChange={setParentPageId}
          options={[
            { label: "None — top level", searchText: "top level root", value: "" },
            ...parentPages.map((page) => ({
              icon: <FileText aria-hidden size={18} strokeWidth={1.75} />,
              label: `${"— ".repeat(Math.max(0, page.path.length - 1))}${page.title}${page.status !== "published" ? ` (${page.status})` : ""}`,
              searchText: page.path.join("/"),
              value: page.id,
            })),
          ]}
          searchLabel="Search pages"
          value={parentPageId}
        />
        <p className="meta">
          Nesting groups this page under the parent in the page tree; readers expand the parent to
          find it. You can also re-nest any page later by dragging it in the page tree.
        </p>

        <label>
          <span className="meta">Type</span>
          <select
            className="input"
            onChange={(e) => setNodeKind(e.target.value as "page" | "group" | "link")}
            value={nodeKind}
          >
            <option value="page">Page — has its own content</option>
            <option value="group">Group heading — organizes pages in the tree, no page of its own</option>
            <option value="link">Link — a tree item that opens another URL</option>
          </select>
        </label>

        {nodeKind === "link" && (
          <>
            <label>
              <span className="meta">Link destination</span>
              <input
                className="input"
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://… or /kb/other-kb/page"
                required
                value={linkUrl}
              />
            </label>
            <label className="attribution-checkbox">
              <input checked={linkNewTab} onChange={(e) => setLinkNewTab(e.target.checked)} type="checkbox" />
              <span>Open in a new tab</span>
            </label>
          </>
        )}

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
