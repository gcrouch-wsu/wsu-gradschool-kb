export type KbStatus = "draft" | "published" | "archived";
export type PageStatus = "draft" | "published" | "archived";
export type AssetStatus = "draft" | "active" | "archived";
export type AssetType = "document" | "image";

export interface KnowledgeBase {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: KbStatus;
  updatedOn: string;
}

export interface KbPage {
  id: string;
  kbId: string;
  title: string;
  slug: string;
  path: string[];
  summary: string;
  status: PageStatus;
  ownerLabel: string;
  contactEmail: string;
  lastReviewedDate: string;
  updatedDisplayDate: string;
  blocks: ContentBlock[];
  relatedPageIds: string[];
  relatedAssetIds: string[];
}

export type ContentBlock =
  | { blockId: string; type: "paragraph"; text: string }
  | { blockId: string; type: "heading"; level: 2 | 3; text: string }
  | { blockId: string; type: "list"; ordered?: boolean; items: string[] }
  | { blockId: string; type: "alert"; variant: "info" | "warning"; text: string }
  | { blockId: string; type: "asset_link"; assetId: string; label?: string };

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
