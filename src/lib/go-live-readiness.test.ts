import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/cron-auth";
import { collectSourcedBlocks } from "@/lib/sourced-review";
import type { ContentBlock } from "@/lib/types";

describe("isCronAuthorized", () => {
  it("rejects when CRON_SECRET is unset", () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const request = new Request("http://localhost/api/admin/cron/x", {
      headers: { authorization: "Bearer anything" },
    });
    expect(isCronAuthorized(request)).toBe(false);
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });

  it("accepts a matching bearer token", () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
    const request = new Request("http://localhost/api/admin/cron/x", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    expect(isCronAuthorized(request)).toBe(true);
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });
});

describe("collectSourcedBlocks", () => {
  it("finds sourced blocks nested in cards and procedures", () => {
    const blocks: ContentBlock[] = [
      {
        blockId: "p1",
        type: "paragraph",
        text: "Intro",
      },
      {
        blockId: "card1",
        type: "card",
        background: "paper",
        blocks: [
          {
            blockId: "src1",
            type: "sourced",
            sourceUrl: "https://gradschool.wsu.edu/example/",
            sourceAnchor: "sec",
            contentHash: "abc",
            headingText: "Example",
            blocks: [],
          },
        ],
      },
    ];
    expect(collectSourcedBlocks(blocks)).toEqual([
      {
        blockId: "src1",
        sourceUrl: "https://gradschool.wsu.edu/example/",
        sourceAnchor: "sec",
        contentHash: "abc",
        label: "Example",
      },
    ]);
  });
});
