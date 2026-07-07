export type KbStatus = "draft" | "published" | "archived";
export type PageStatus = "draft" | "published" | "archived";
export type AssetStatus = "draft" | "active" | "archived";
export type AssetType = "document" | "image" | "video";
export type AssetVersionStatus = "draft" | "active" | "replaced" | "archived";

export interface AssetVersion {
  id: string;
  assetId: string;
  versionNumber: number;
  status: AssetVersionStatus;
  body: string;
  mimeType: string;
  fileSizeBytes: number;
  originalFilename: string;
  width?: number;
  height?: number;
  uploadedAt: string;
  notes?: string;
}

export type AssetUsageType = "inline_image" | "inline_link" | "related";

export interface AssetUsage {
  assetId: string;
  pageId: string;
  pageTitle: string;
  pageStatus: PageStatus;
  usageType: AssetUsageType;
  blockId?: string;
  usesAltText?: boolean;
}

export interface KnowledgeBase {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: KbStatus;
  updatedOn: string;
  homepagePageId?: string | null;

  theme?: import("@/lib/kb-theme").KbTheme;
}

export type PageVisibility = "public" | "staff";

export interface KbPage {
  id: string;
  kbId: string;
  title: string;
  slug: string;
  path: string[];
  sortOrder: number;
  summary: string;
  status: PageStatus;
  visibility: PageVisibility;
  ownerLabel: string;
  contactEmail: string;
  lastReviewedDate: string;
  updatedDisplayDate: string;
  blocks: ContentBlock[];
  relatedPageIds: string[];
  relatedAssetIds: string[];
  showToc: boolean;
  tocDepth: number;

  showSummary?: boolean;
  showPrintButton?: boolean;
  lockedBy?: string | null;
  lockedAt?: string | null;
  aliasTargetId?: string | null;

  nextReviewDate?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export type PageMoveTarget = { kbId: string; parentPath: string[] };

export interface PageTreeNode {
  page: KbPage;
  children: PageTreeNode[];
}

export interface KbDataset {
  knowledgeBases: KnowledgeBase[];
  pages: KbPage[];
  assets: Asset[];
}

export type TextAlign = "left" | "center" | "right";

export type ContentBlock =
  | { blockId: string; type: "paragraph"; text: string; html?: string; align?: TextAlign }
  | { blockId: string; type: "heading"; level: 2 | 3; text: string; html?: string; align?: TextAlign }
  | { blockId: string; type: "list"; ordered?: boolean; start?: number; items: string[]; itemHtml?: string[] }
  | { blockId: string; type: "alert"; variant: "info"; text: string; html?: string }
  | {
      blockId: string;
      type: "image";
      assetId?: string;
      url?: string;
      alt?: string;

      decorative?: boolean;
      widthPercent?: number;
      align?: TextAlign;
      caption?: string;
    }
  | { blockId: string; type: "section_divider" }
  | {
      blockId: string;
      type: "table";
      caption?: string;
      hasHeaderRow: boolean;
      hasHeaderColumn: boolean;
      rows: string[][];
      rowsHtml?: string[][];
    }
  | { blockId: string; type: "asset_link"; assetId: string; label?: string }
  | {
      blockId: string;
      type: "card";
      title?: string;
      background: "paper" | "wash" | "crimson";
      blocks: ContentBlock[];
    }
  | {
      blockId: string;
      type: "procedure_section";
      title: string;
      level: 2 | 3;
      blocks: ContentBlock[];
    }
  | {
      blockId: string;
      type: "video";
      assetId?: string;
      url?: string;
      title?: string;
      provider?: "youtube" | "vimeo" | "direct";
      embedId?: string;
    };

export type StagedImportStatus = "uploaded" | "parsed" | "needs_review" | "failed";
export type StagedImportSourceType = "docx" | "doc";
export type StagedImportMediaReviewStatus = "pending" | "approved" | "rejected";

export interface StagedImport {
  id: string;
  kbId: string;
  sourceType: StagedImportSourceType;
  originalFilename: string;
  sourceBlobUrl: string;
  status: StagedImportStatus;
  parsedTitle: string | null;
  blocks: ContentBlock[];
  messages: string[];
  title: string;
  slug: string;
  summary: string;
  parentPath: string[];
  visibility: PageVisibility;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StagedImportMedia {
  id: string;
  stagedImportId: string;
  blockId: string;
  temporaryUrl: string;
  mimeType: string;
  originalFilename: string;
  proposedTitle: string;
  proposedSlug: string;
  altText: string;
  reviewStatus: StagedImportMediaReviewStatus;
  width?: number;
  height?: number;
}

export interface StagedImportDetail {
  import: StagedImport;
  media: StagedImportMedia[];
  kbSlug: string;
}

export interface Asset {
  id: string;
  homeKbId: string;
  title: string;
  slug: string;
  description: string;
  assetType: AssetType;
  mimeType: string;
  fileSizeBytes: number;
  status: AssetStatus;
  ownerLabel: string;
  lastReviewedDate: string;
  updatedDisplayDate: string;
  versionId: string;
  body: string;

  altText?: string | null;

  videoProvider?: "youtube" | "vimeo" | "direct" | null;
  videoExternalId?: string | null;
  videoUrl?: string | null;
}

export interface KbRedirect {
  id: string;
  kbId: string;
  fromPath: string;
  toPath: string;
  status: "active" | "inactive";
  createdAt: string;
  reason: string;
}

export type UserRole = "owner" | "admin" | "editor";

export interface User {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface KbUserAssignment {
  kbId: string;
  userId: string;
}

export type AuditEntityType = "page" | "asset" | "kb" | "import" | "redirect" | "user" | "settings" | "search";

export interface AuditLogEntry {
  id: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  kbId?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}
