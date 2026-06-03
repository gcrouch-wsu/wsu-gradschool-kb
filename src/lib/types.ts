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
}

export interface PageTreeNode {
  page: KbPage;
  children: PageTreeNode[];
}

export interface KbDataset {
  knowledgeBases: KnowledgeBase[];
  pages: KbPage[];
  assets: Asset[];
}

export type ContentBlock =
  | { blockId: string; type: "paragraph"; text: string; html?: string }
  | { blockId: string; type: "heading"; level: 2 | 3; text: string; html?: string }
  | { blockId: string; type: "list"; ordered?: boolean; items: string[]; itemHtml?: string[] }
  | { blockId: string; type: "alert"; variant: "info" | "warning"; text: string; html?: string }
  | { blockId: string; type: "image"; assetId?: string; url?: string; alt?: string; widthPercent?: number }
  | {
      blockId: string;
      type: "table";
      caption?: string;
      hasHeaderRow: boolean;
      hasHeaderColumn: boolean;
      rows: string[][];
      rowsHtml?: string[][];
    }
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
