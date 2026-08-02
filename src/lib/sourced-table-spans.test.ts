import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blocksToDocumentHtml, documentHtmlToBlocks } from "@/lib/page-document";

// The real Graduate School Policies & Procedures "Membership and Roles" table, whose group
// header ("Allowed Committee Roles") spans three columns. Spans have regressed here before:
// the published KB page still shows a snapshot taken before span support, where the colspan
// collapsed into six empty cells with the label stranded beside them.
const FIXTURE = resolve(process.cwd(), "tests/fixtures/pp-spanned-table.html");

describe("spanned tables from sourced content", () => {
  const table = documentHtmlToBlocks(readFileSync(FIXTURE, "utf8")).find(
    (block) => block.type === "table",
  );

  it("parses the table", () => {
    expect(table).toBeTruthy();
  });

  it("preserves the three-column group header span", () => {
    const spans = (table as Extract<typeof table, { type: "table" }>).colSpans;
    expect(spans).toBeTruthy();
    expect(spans!.flat()).toContain(3);
  });

  it("keeps the span through a full HTML round-trip", () => {
    const html = blocksToDocumentHtml([table!]);
    expect(html).toMatch(/colspan="3"/i);
    const again = documentHtmlToBlocks(html).find((b) => b.type === "table");
    const spans = (again as Extract<typeof again, { type: "table" }>).colSpans;
    expect(spans!.flat()).toContain(3);
  });
});
