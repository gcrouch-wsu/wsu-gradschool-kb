"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { AdminPageTreeManager } from "@/components/AdminPageTreeManager";
import { KbScopePicker, type KbScopeOption } from "@/components/KbScopePicker";
import { WorkspaceEmptyState } from "@/components/WorkspaceEmptyState";
import type { KnowledgeBase, KbPage } from "@/lib/types";

export interface AdminPagesDestinationKb {
  id: string;
  title: string;
  slug: string;
  visibility: KnowledgeBase["visibility"];
}

interface AdminPagesWorkspaceProps {
  canDelete: boolean;
  canManagePublishPolicy: boolean;
  destinationKbs: AdminPagesDestinationKb[];
  kb: KnowledgeBase;
  kbs: KbScopeOption[];
  pages: KbPage[];
}

export function AdminPagesWorkspace({
  canDelete,
  canManagePublishPolicy,
  destinationKbs,
  kb,
  kbs,
  pages,
}: AdminPagesWorkspaceProps) {
  const router = useRouter();

  const selectKb = useCallback(
    (slug: string) => {
      if (slug === kb.slug) return;
      router.replace(`/admin/pages?kb=${encodeURIComponent(slug)}`, { scroll: false });
    },
    [kb.slug, router],
  );

  if (kbs.length === 0) {
    return (
      <WorkspaceEmptyState
        action={{ href: "/admin/kbs", label: "Create a knowledge base" }}
        message="No knowledge bases"
      />
    );
  }

  return (
    <>
      <KbScopePicker kbs={kbs} onSelect={selectKb} selectedSlug={kb.slug} />

      <section className="card admin-pages__kb-card">
        <div className="admin-actions admin-pages__kb-header">
          <h2>
            {kb.title}
            {kb.visibility === "private" && (
              <>
                {" "}
                <span className="badge badge--staff">Private</span>
              </>
            )}
          </h2>
          <Link className="button button--small button--ghost" href={`/admin/pages/new?kb=${kb.id}`}>
            + New Page
          </Link>
        </div>
        <AdminPageTreeManager
          key={kb.id}
          canDelete={canDelete}
          canManagePublishPolicy={canManagePublishPolicy}
          destinationKbs={destinationKbs}
          initialPages={pages}
          kb={kb}
        />
      </section>
    </>
  );
}
