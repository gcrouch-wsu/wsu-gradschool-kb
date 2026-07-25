import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import type { AssetUsage, AssetUsageType, KbPage, PageStatus } from "@/lib/types";

/** Persist asset usage rows for one page (replace-all for that page_id). */
export async function rebuildAssetUsagesForPage(page: KbPage): Promise<void> {
  if (!isDatabaseEnabled()) {
    return;
  }
  await ensureSchema();
  const sql = getSql();
  const all: Array<{
    assetId: string;
    pageId: string;
    pageTitle: string;
    pageStatus: string;
    blockId?: string;
    usageType: string;
  }> = [];

  for (const block of page.blocks) {
    if (block.type === "image" && block.assetId) {
      all.push({
        assetId: block.assetId,
        pageId: page.id,
        pageTitle: page.title,
        pageStatus: page.status,
        blockId: block.blockId,
        usageType: "inline_image",
      });
    } else if (block.type === "asset_link" && block.assetId) {
      all.push({
        assetId: block.assetId,
        pageId: page.id,
        pageTitle: page.title,
        pageStatus: page.status,
        blockId: block.blockId,
        usageType: "inline_link",
      });
    }
  }
  for (const assetId of page.relatedAssetIds) {
    all.push({
      assetId,
      pageId: page.id,
      pageTitle: page.title,
      pageStatus: page.status,
      usageType: "related",
    });
  }

  await sql`DELETE FROM kb_asset_usages WHERE page_id = ${page.id}`;
  for (const usage of all) {
    await sql`
      INSERT INTO kb_asset_usages (
        id, asset_id, page_id, kb_id, block_id, usage_type, page_title, page_status, updated_at
      ) VALUES (
        ${`usage-${crypto.randomUUID()}`},
        ${usage.assetId},
        ${usage.pageId},
        ${page.kbId},
        ${usage.blockId ?? null},
        ${usage.usageType},
        ${usage.pageTitle},
        ${usage.pageStatus},
        now()
      )
    `;
  }
}

export async function deleteAssetUsagesForPage(pageId: string): Promise<void> {
  if (!isDatabaseEnabled()) return;
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM kb_asset_usages WHERE page_id = ${pageId}`;
}

export async function listIndexedUsagesForAsset(assetId: string): Promise<AssetUsage[] | null> {
  if (!isDatabaseEnabled()) {
    return null;
  }
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT asset_id, page_id, page_title, page_status, usage_type, block_id
      FROM kb_asset_usages
      WHERE asset_id = ${assetId}
      ORDER BY page_title, usage_type
    `) as unknown as Array<{
      asset_id: string;
      page_id: string;
      page_title: string;
      page_status: string;
      usage_type: string;
      block_id: string | null;
    }>;
    return rows.map((row) => ({
      assetId: row.asset_id,
      pageId: row.page_id,
      pageTitle: row.page_title,
      pageStatus: (row.page_status as PageStatus) || "draft",
      usageType: row.usage_type as AssetUsageType,
      blockId: row.block_id ?? undefined,
    }));
  } catch {
    return null;
  }
}

/** Asset ids that appear at least once in the usage index (optionally scoped to KB ids). */
export async function listIndexedUsedAssetIds(allowedKbIds: string[] | null = null): Promise<Set<string> | null> {
  if (!isDatabaseEnabled()) {
    return null;
  }
  await ensureSchema();
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT DISTINCT asset_id, kb_id FROM kb_asset_usages
    `) as unknown as Array<{ asset_id: string; kb_id: string }>;
    const allowed = allowedKbIds === null ? null : new Set(allowedKbIds);
    const used = new Set<string>();
    for (const row of rows) {
      if (allowed === null || allowed.has(row.kb_id)) {
        used.add(row.asset_id);
      }
    }
    return used;
  } catch {
    return null;
  }
}
