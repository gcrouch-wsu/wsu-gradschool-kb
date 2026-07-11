import { describe, expect, it } from "vitest";
import { ensureSchema, getSql, isDatabaseEnabled } from "@/lib/db";
import { buildKbExport } from "@/lib/kb-export";

const decoder = new TextDecoder();

function readUInt16(data: Uint8Array, offset: number) {
  return data[offset] | (data[offset + 1] << 8);
}

function readUInt32(data: Uint8Array, offset: number) {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function readZipEntries(data: Uint8Array) {
  const entries = new Map<string, string>();
  let offset = 0;
  while (offset < data.length) {
    const signature = readUInt32(data, offset);
    if (signature !== 0x04034b50) break;
    const compressedSize = readUInt32(data, offset + 18);
    const nameLength = readUInt16(data, offset + 26);
    const extraLength = readUInt16(data, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(data.slice(nameStart, nameStart + nameLength));
    const body = decoder.decode(data.slice(dataStart, dataStart + compressedSize));
    entries.set(name, body);
    offset = dataStart + compressedSize;
  }
  return entries;
}

describe.skipIf(!isDatabaseEnabled())("KB export live DB", () => {
  it("includes draft and archived pages with their statuses in kb.json", async () => {
    await ensureSchema();
    const sql = getSql();
    const id = crypto.randomUUID();
    const kbId = `test-export-kb-${id}`;

    try {
      await sql`
        INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
        VALUES (${kbId}, ${`test-export-${id}`}, 'Export Test', 'Export test KB', 'draft', '2026-07-10')
      `;
      for (const status of ["draft", "archived"] as const) {
        await sql`
          INSERT INTO kb_pages (
            id, kb_id, slug, path, sort_order, title, summary, status, visibility,
            owner_label, contact_email, last_reviewed_date, updated_display_date,
            blocks, related_page_ids, related_asset_ids, show_toc, toc_depth,
            show_summary, show_print_button
          ) VALUES (
            ${`test-export-${status}-${id}`}, ${kbId}, ${status}, ${status}, 0, ${status}, '', ${status}, 'public',
            'Graduate School', 'gradschool@example.edu', '2026-01-01', '2026-01-01',
            '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, 3,
            true, true
          )
        `;
      }

      const archive = await buildKbExport(kbId);
      expect(archive).not.toBeNull();
      const entries = readZipEntries(archive!.body);
      const manifest = JSON.parse(entries.get("kb.json")!);
      expect(manifest.pages.map((page: { status: string }) => page.status).sort()).toEqual(["archived", "draft"]);
    } finally {
      await sql`DELETE FROM kb_pages WHERE kb_id = ${kbId}`;
      await sql`DELETE FROM knowledge_bases WHERE id = ${kbId}`;
    }
  });
});
