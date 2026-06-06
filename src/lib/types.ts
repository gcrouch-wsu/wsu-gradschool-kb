export type KbStatus = "draft" | "published" | "archived";
export type PageStatus = "draft" | "published" | "archived";
export type AssetStatus = "draft" | "active" | "archived";
export type AssetType = "document" | "image" | "video";
export type AssetVersionStatus = "draft" | "active" | "replaced" | "archived";

/**
 * One stored file behind an asset. The asset's stable public URL always resolves
 * to its single `active` version; replacing an asset adds a new version and
 * demotes the prior active one to `replaced` (retained for admin rollback only).
 * See project_spec.md §10 "Asset Version".
 */
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

/** Where a single asset is used, for impact review before replace/archive. */
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
  /** Per-KB "Manage Styles" theme. Undefined falls back to the platform default. */
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
  /** Whether to display the summary as a lead paragraph on the public page. Default true. */
  showSummary?: boolean;
  lockedBy?: string | null;
  lockedAt?: string | null;
  aliasTargetId?: string | null;
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

/** Horizontal alignment for text blocks and images. Omitted = default (left). */
export type TextAlign = "left" | "center" | "right";

export type ContentBlock =
  | { blockId: string; type: "paragraph"; text: string; html?: string; align?: TextAlign }
  | { blockId: string; type: "heading"; level: 2 | 3; text: string; html?: string; align?: TextAlign }
  | { blockId: string; type: "list"; ordered?: boolean; items: string[]; itemHtml?: string[] }
  | { blockId: string; type: "alert"; variant: "info" | "warning"; text: string; html?: string }
  | { blockId: string; type: "editor_note"; text: string; html?: string }
  | {
      blockId: string;
      type: "image";
      assetId?: string;
      url?: string;
      alt?: string;
      /** Marked decorative: rendered with empty alt and exempt from the alt-text publish gate. */
      decorative?: boolean;
      widthPercent?: number;
      align?: TextAlign;
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
      type: "video";
      assetId?: string;
      url?: string;
      title?: string;
      provider?: "youtube" | "vimeo" | "direct";
      embedId?: string;
    };

export type StagedImportStatus = "uploaded" | "parsed" | "needs_review" | "failed";
export type StagedImportSourceType = "docx";
export type StagedImportMediaReviewStatus = "pending" | "approved" | "rejected";

/** DOCX import held for review before becoming a draft page (project_spec.md §12). */
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

/** Embedded image extracted during DOCX staging for alt/title review before commit. */
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
}

/** Auto-redirect from a former public page path after slug/parent moves. */
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
