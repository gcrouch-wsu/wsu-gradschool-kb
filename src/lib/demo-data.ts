import type { Asset, KbDataset, KbPage, KnowledgeBase } from "@/lib/types";

export const knowledgeBases: KnowledgeBase[] = [
  {
    id: "kb-grad-school",
    title: "Graduate School Knowledge Base",
    slug: "graduate-school",
    description:
      "Public procedures, guidance, templates, and support information for Graduate School partners.",
    status: "published",
    visibility: "public",
    updatedOn: "2026-06-02",
  },
  {
    id: "kb-grad-school-2",
    title: "Graduate School Knowledge Base 2",
    slug: "graduate-school-2",
    description:
      "Public procedures, guidance, templates, and support information for Graduate School partners.",
    status: "published",
    visibility: "public",
    updatedOn: "2026-06-02",
  },
  {
    id: "kb-grad-school-3",
    title: "Graduate School Knowledge Base 3",
    slug: "graduate-school-3",
    description:
      "Public procedures, guidance, templates, and support information for Graduate School partners.",
    status: "published",
    visibility: "public",
    updatedOn: "2026-06-02",
  },
  {
    id: "kb-private-staff",
    title: "Graduate School Staff Knowledge Base",
    slug: "graduate-school-staff",
    description: "Private operational guidance for Graduate School staff.",
    status: "published",
    visibility: "private",
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
  {
    id: "asset-private-orientation",
    homeKbId: "kb-private-staff",
    title: "Private Staff Orientation Checklist",
    slug: "private-staff-orientation-checklist",
    description: "A private staff-only onboarding checklist for access-matrix testing.",
    assetType: "document",
    mimeType: "text/plain; charset=utf-8",
    fileSizeBytes: 238,
    status: "active",
    ownerLabel: "Graduate School",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    versionId: "asset-version-private-orientation-1",
    body:
      "Private Staff Orientation Checklist\n\n- Confirm assigned KB access.\n- Review internal escalation contacts.\n- Verify private managed asset delivery.\n",
  },
];

export const pages: KbPage[] = [
  {
    id: "page-section-procedures",
    kbId: "kb-grad-school",
    title: "Procedures",
    slug: "procedures",
    path: ["procedures"],
    sortOrder: 10,
    summary: "Procedural guidance for maintaining Graduate School knowledge base content.",
    status: "published",
    visibility: "public",
    ownerLabel: "Graduate School Outreach and Technology",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    relatedPageIds: ["page-program-fact-sheets"],
    relatedAssetIds: [],
    showToc: false,
    tocDepth: 2,
    blocks: [
      {
        blockId: "intro",
        type: "paragraph",
        text:
          "This section collects step-by-step procedures used by Graduate School partners to maintain public information.",
      },
    ],
  },
  {
    id: "page-section-templates",
    kbId: "kb-grad-school",
    title: "Templates",
    slug: "templates",
    path: ["templates"],
    sortOrder: 20,
    summary: "Managed templates available to graduate programs.",
    status: "published",
    visibility: "staff",
    ownerLabel: "Graduate School",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    relatedPageIds: ["page-handbooks"],
    relatedAssetIds: [],
    showToc: false,
    tocDepth: 2,
    blocks: [
      {
        blockId: "intro",
        type: "paragraph",
        text:
          "Templates in this section are served through stable KB asset routes so they can be replaced without breaking links from program websites.",
      },
    ],
  },
  {
    id: "page-program-fact-sheets",
    kbId: "kb-grad-school",
    title: "Maintaining Program Fact Sheets",
    slug: "maintaining-program-fact-sheets",
    path: ["procedures", "maintaining-program-fact-sheets"],
    sortOrder: 10,
    summary:
      "How Graduate School partners access, review, and update public program fact sheets.",
    status: "published",
    visibility: "public",
    ownerLabel: "Graduate School Outreach and Technology",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    relatedPageIds: ["page-handbooks"],
    relatedAssetIds: ["asset-fact-sheet-checklist"],
    showToc: true,
    tocDepth: 3,
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
        blockId: "review-table",
        type: "table",
        caption: "Recommended fact sheet review checks",
        hasHeaderRow: true,
        hasHeaderColumn: false,
        rows: [
          ["Area", "Check"],
          ["Program details", "Confirm degree, certificate, and application information."],
          ["Contact", "Use a shared mailbox where possible."],
          ["Links", "Confirm public links and managed file links still work."],
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
    sortOrder: 10,
    summary:
      "Guidance and templates for maintaining graduate program handbooks.",
    status: "published",
    visibility: "staff",
    ownerLabel: "Graduate School",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    relatedPageIds: ["page-program-fact-sheets"],
    relatedAssetIds: ["asset-handbook-template"],
    showToc: true,
    tocDepth: 3,
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
  {
    id: "page-private-staff-orientation",
    kbId: "kb-private-staff",
    title: "Private Staff Orientation",
    slug: "private-staff-orientation",
    path: ["private-staff-orientation"],
    sortOrder: 10,
    summary: "Private onboarding guidance for Graduate School staff.",
    status: "published",
    visibility: "public",
    ownerLabel: "Graduate School",
    contactEmail: "gradschool@wsu.edu",
    lastReviewedDate: "2026-06-02",
    updatedDisplayDate: "2026-06-02",
    relatedPageIds: [],
    relatedAssetIds: ["asset-private-orientation"],
    showToc: true,
    tocDepth: 3,
    blocks: [
      {
        blockId: "intro",
        type: "paragraph",
        text:
          "This private page exists in seed data so local in-memory mode can exercise private KB read access.",
      },
      {
        blockId: "private-file",
        type: "asset_link",
        assetId: "asset-private-orientation",
      },
    ],
  },
];

export const seedDataset: KbDataset = {
  knowledgeBases,
  pages,
  assets,
};
