import { describe, expect, it } from "vitest";
import { canExportKb, buildKbExport } from "@/lib/kb-export";
import { getAllKbsForAdmin } from "@/lib/kb-store";

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

describe("KB export", () => {
  it("allows only owners to export", () => {
    expect(canExportKb({ role: "owner" })).toBe(true);
    expect(canExportKb({ role: "admin" })).toBe(false);
    expect(canExportKb({ role: "editor" })).toBe(false);
    expect(canExportKb(null)).toBe(false);
  });

  it("exports a seeded KB as a ZIP manifest with page HTML", async () => {
    const [kb] = await getAllKbsForAdmin();
    const archive = await buildKbExport(kb.id);

    expect(archive).not.toBeNull();
    const entries = readZipEntries(archive!.body);
    expect(entries.has("kb.json")).toBe(true);
    expect([...entries.keys()].some((name) => name.startsWith("pages/") && name.endsWith(".html"))).toBe(true);

    const manifest = JSON.parse(entries.get("kb.json")!);
    expect(manifest.knowledgeBase.id).toBe(kb.id);
    expect(manifest.pages.length).toBeGreaterThan(0);
  });
});
