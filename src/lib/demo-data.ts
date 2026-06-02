import type { Asset, KbPage, KnowledgeBase } from "@/lib/types";

export const knowledgeBases: KnowledgeBase[] = [
  {
    id: "kb-grad-school",
    title: "Graduate School Knowledge Base",
    slug: "graduate-school",
    description:
      "Public procedures, guidance, templates, and support information for Graduate School partners.",
    status: "published",
    updatedOn: "2026-06-02",
  },
];

export const assets: Asset[] = [
  {
    id: "asset-fact-sheet-checklist",
    homeKbId: "kb-grad-school",
    title: "Fact Sheet Update Checklist",
    slug: "fact-sheet-update-checklist",
    description:
      "A short checklist for reviewing program fact sheet updates before publication.",
    assetType: "document",
    mimeType: "text/plain; charset=utf-8",
    fileSizeBytes: 1052,
    status: "active",
    ownerLabel: "Graduate School Outreach and Technology",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    versionId: "asset-version-fact-sheet-checklist-1",
    body:
      "Fact Sheet Update Checklist\n\n- Confirm program name and degree information.\n- Confirm application and handbook URLs.\n- Confirm contact information uses a shared mailbox where possible.\n- Confirm required fields are complete.\n- Preview changes before publishing.\n",
  },
  {
    id: "asset-handbook-template",
    homeKbId: "kb-grad-school",
    title: "Graduate Program Handbook Template",
    slug: "graduate-program-handbook-template",
    description:
      "A managed placeholder for the graduate program handbook template asset.",
    assetType: "document",
    mimeType: "text/plain; charset=utf-8",
    fileSizeBytes: 742,
    status: "active",
    ownerLabel: "Graduate School",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    versionId: "asset-version-handbook-template-1",
    body:
      "Graduate Program Handbook Template\n\nThis deployable prototype streams managed assets through stable KB routes. Replace this seeded asset with Blob-backed file versions in the production implementation.\n",
  },
];

export const pages: KbPage[] = [
  {
    id: "page-program-fact-sheets",
    kbId: "kb-grad-school",
    title: "Maintaining Program Fact Sheets",
    slug: "maintaining-program-fact-sheets",
    path: ["procedures", "maintaining-program-fact-sheets"],
    summary:
      "How Graduate School partners access, review, and update public program fact sheets.",
    status: "published",
    ownerLabel: "Graduate School Outreach and Technology",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    relatedPageIds: ["page-handbooks"],
    relatedAssetIds: ["asset-fact-sheet-checklist"],
    blocks: [
      {
        blockId: "intro",
        type: "paragraph",
        text:
          "Fact sheets on the Graduate School website provide application details for degree and certificate programs. They are linked from program websites and application systems, so update workflows need to be clear and maintainable.",
      },
      {
        blockId: "access-heading",
        type: "heading",
        level: 2,
        text: "Access to Fact Sheets",
      },
      {
        blockId: "access-copy",
        type: "paragraph",
        text:
          "Graduate program coordinators and directors should use approved access paths and contact the Graduate School support team when role or permission changes are needed.",
      },
      {
        blockId: "role-heading",
        type: "heading",
        level: 2,
        text: "Editing Guidance",
      },
      {
        blockId: "role-list",
        type: "list",
        items: [
          "Use shared mailbox contact information where possible.",
          "Preview changes before publishing.",
          "Do not change fields marked as restricted without Graduate School review.",
          "Confirm links and screenshots during each review cycle.",
        ],
      },
      {
        blockId: "file-link-checklist",
        type: "asset_link",
        assetId: "asset-fact-sheet-checklist",
      },
    ],
  },
  {
    id: "page-handbooks",
    kbId: "kb-grad-school",
    title: "Graduate Program Handbooks",
    slug: "graduate-program-handbooks",
    path: ["templates", "graduate-program-handbooks"],
    summary:
      "Guidance and templates for maintaining graduate program handbooks.",
    status: "published",
    ownerLabel: "Graduate School",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    relatedPageIds: ["page-program-fact-sheets"],
    relatedAssetIds: ["asset-handbook-template"],
    blocks: [
      {
        blockId: "intro",
        type: "paragraph",
        text:
          "Graduate program handbooks should be reviewed regularly and linked from stable, managed KB asset routes.",
      },
      {
        blockId: "template-heading",
        type: "heading",
        level: 2,
        text: "Template",
      },
      {
        blockId: "template-copy",
        type: "paragraph",
        text:
          "The template asset below is served through a stable permalink. Future replacement should update the managed asset version rather than every page using the template.",
      },
      {
        blockId: "file-link-template",
        type: "asset_link",
        assetId: "asset-handbook-template",
      },
    ],
  },
];

export function getPublishedKbs() {
  return knowledgeBases.filter((kb) => kb.status === "published");
}

export function getKbBySlug(slug: string) {
  return knowledgeBases.find((kb) => kb.slug === slug && kb.status === "published") ?? null;
}

export function getKbById(id: string) {
  return knowledgeBases.find((kb) => kb.id === id) ?? null;
}

export function getPublishedPagesForKb(kbId: string) {
  return pages.filter((page) => page.kbId === kbId && page.status === "published");
}

export function getPageByPath(kbId: string, path: string[]) {
  return (
    pages.find(
      (page) =>
        page.kbId === kbId &&
        page.status === "published" &&
        page.path.join("/") === path.join("/"),
    ) ?? null
  );
}

export function getAssetBySlug(homeKbId: string, slug: string) {
  return (
    assets.find(
      (asset) =>
        asset.homeKbId === homeKbId &&
        asset.slug === slug &&
        asset.status === "active",
    ) ?? null
  );
}

export function getAssetById(assetId: string) {
  return assets.find((asset) => asset.id === assetId && asset.status === "active") ?? null;
}

export function searchKb(kbId: string, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const pageResults = getPublishedPagesForKb(kbId)
    .map((page) => {
      const body = page.blocks
        .map((block) => ("text" in block ? block.text : "items" in block ? block.items.join(" ") : ""))
        .join(" ");
      const haystack = `${page.title} ${page.summary} ${body}`.toLowerCase();
      return haystack.includes(normalized)
        ? { type: "page" as const, id: page.id, title: page.title, summary: page.summary, path: page.path }
        : null;
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result));

  const assetResults = assets
    .filter((asset) => asset.homeKbId === kbId && asset.status === "active")
    .map((asset) => {
      const haystack = `${asset.title} ${asset.description} ${asset.slug}`.toLowerCase();
      return haystack.includes(normalized)
        ? { type: "asset" as const, id: asset.id, title: asset.title, summary: asset.description, slug: asset.slug }
        : null;
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result));

  return [...pageResults, ...assetResults];
}
