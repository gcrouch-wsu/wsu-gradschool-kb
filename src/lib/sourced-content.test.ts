import { afterEach, describe, expect, it, vi } from "vitest";
import { excerptAttributionLabel, type ResolvedExcerpt } from "@/lib/excerpts";
import { blocksToDocumentHtml, documentHtmlToBlocks } from "@/lib/page-document";
import { validatePageForPublish } from "@/lib/publish-gate";
import {
  buildSourcedFromPastedHtml,
  extractSourcedSectionFromHtml,
  fetchSourcedSection,
  hashSourcedBlocks,
  parseAllowedSourceUrl,
  sourcedDefaultLabel,
} from "@/lib/sourced-content";
import type { ContentBlock } from "@/lib/types";

const BASE = new URL("https://gradschool.wsu.edu/graduate-school-policies-and-procedures/");

const SOURCE_PAGE_HTML = `
<main>
  <h5 id="faculty-of-the-graduate-school">Faculty of the Graduate School</h5>
  <p>Parent section intro.</p>
  <h6 id="graduate-program-faculty">Graduate Program Faculty</h6>
  <p>Graduate program faculty are appointed by <a href="/faculty-appointments/">the appointment process</a>.</p>
  <table><tr><th>Role</th><th>Term</th></tr><tr><td>Member</td><td>3 years</td></tr></table>
  <ul><li>First duty</li><li>Second duty</li></ul>
  <h6 id="next-section">Next Section</h6>
  <p>Should not be included.</p>
</main>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractSourcedSectionFromHtml", () => {
  it("extracts from the anchor heading to the next same-or-higher heading", () => {
    const extracted = extractSourcedSectionFromHtml(SOURCE_PAGE_HTML, "graduate-program-faculty", BASE);
    expect(extracted).not.toBeNull();
    expect(extracted?.headingText).toBe("Graduate Program Faculty");
    expect(extracted?.fragmentHtml).toContain("appointed by");
    expect(extracted?.fragmentHtml).not.toContain("Should not be included");
  });

  it("absolutizes relative links and normalizes tables to the doc-table contract", () => {
    const extracted = extractSourcedSectionFromHtml(SOURCE_PAGE_HTML, "graduate-program-faculty", BASE);
    expect(extracted?.fragmentHtml).toContain('href="https://gradschool.wsu.edu/faculty-appointments/"');
    expect(extracted?.fragmentHtml).toContain('class="doc-table"');
    expect(extracted?.fragmentHtml).toContain('data-header-row="true"');
  });

  it("computes CSS-counter section numbers and the document title, excluding the TOC nav", () => {
    const numberedHtml = `
      <h1>2025-2026 Graduate School Policies and Procedures</h1>
      <div class="manual-grid" data-numbering-mode="css-counters">
        <nav class="manual-toc"><h2 id="toc-heading">Table of Contents</h2></nav>
        <main class="manual"><div class="manual">
          <h2 id="ch1">Chapter One</h2>
          <h3 id="ch1-s1">Governance</h3>
          <h2 id="ch2">Chapter Two</h2>
          <h2 id="ch3">Chapter Three</h2>
          <h3 id="ch3-s1">Descriptions of Graduate Programs</h3>
          <h4 id="doctoral-programs">Doctoral Programs</h4>
          <p>Doctoral body.</p>
          <h5 id="academic-requirements">Academic Requirements for Doctoral Programs at WSU</h5>
          <p>Requirements body.</p>
          <h4 id="masters-programs">Masters Programs</h4>
        </div></main>
      </div>`;
    const section = extractSourcedSectionFromHtml(numberedHtml, "doctoral-programs", BASE);
    expect(section?.headingText).toBe("3.1.1 Doctoral Programs");
    expect(section?.documentTitle).toBe("2025-2026 Graduate School Policies and Procedures");
    expect(section?.fragmentHtml).toContain("Requirements body");
    expect(section?.fragmentHtml).not.toContain("Masters Programs");

    const subsection = extractSourcedSectionFromHtml(numberedHtml, "academic-requirements", BASE);
    expect(subsection?.headingText).toBe("3.1.1.1 Academic Requirements for Doctoral Programs at WSU");
  });

  it("unwraps blockquote and div containers so sibling paragraphs stay separate blocks", () => {
    const wrapped = `
      <main>
        <h4 id="dual-masters">Dual Programs</h4>
        <blockquote>
          <p>First paragraph of policy.</p>
          <p>Second paragraph of policy.</p>
        </blockquote>
        <h4 id="next">Next</h4>
      </main>`;
    const extracted = extractSourcedSectionFromHtml(wrapped, "dual-masters", BASE);
    const blocks = documentHtmlToBlocks(extracted!.fragmentHtml);
    const paragraphs = blocks.filter((block) => block.type === "paragraph");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toMatchObject({ text: "First paragraph of policy." });
    expect(paragraphs[1]).toMatchObject({ text: "Second paragraph of policy." });
  });

  it("leaves headings unnumbered when the page does not declare css-counter numbering", () => {
    const extracted = extractSourcedSectionFromHtml(SOURCE_PAGE_HTML, "graduate-program-faculty", BASE);
    expect(extracted?.headingText).toBe("Graduate Program Faculty");
  });

  it("returns null for a missing anchor or a non-heading anchor", () => {
    expect(extractSourcedSectionFromHtml(SOURCE_PAGE_HTML, "no-such-anchor", BASE)).toBeNull();
    expect(
      extractSourcedSectionFromHtml(`<div id="not-a-heading">x</div>`, "not-a-heading", BASE),
    ).toBeNull();
  });

  it("produces blocks that keep the table and list through the sanitizer", () => {
    const extracted = extractSourcedSectionFromHtml(SOURCE_PAGE_HTML, "graduate-program-faculty", BASE);
    const blocks = documentHtmlToBlocks(extracted!.fragmentHtml);
    expect(blocks.some((block) => block.type === "table")).toBe(true);
    expect(blocks.some((block) => block.type === "list")).toBe(true);
  });

  it("preserves word-to-html colspan tables and promotes a full-width title to caption", () => {
    // Mirrors the Membership and Roles table emitted by wsu-gradschool-word-to-html
    // for P&P §1.4.1.3 — a thead title with colspan=9 plus a group header spanning
    // the last three committee-role columns.
    const membershipHtml = `
      <main>
        <h5 id="faculty-of-the-graduate-school">Faculty of the Graduate School</h5>
        <table>
          <thead>
            <tr><th colspan="9"><strong>Membership and Roles of the Faculty of the Graduate School</strong></th></tr>
          </thead>
          <tbody>
            <tr>
              <td></td><td></td><td></td><td></td><td></td><td></td>
              <td colspan="3"><strong>Allowed Committee Roles<sup>1</sup></strong></td>
            </tr>
            <tr>
              <td></td>
              <td><em>Appointment</em></td>
              <td><em>Ranks</em></td>
              <td><em>Initial Nomination</em></td>
              <td><em>Term</em></td>
              <td><em>Renewal Nomination</em></td>
              <td><em>Chair</em></td>
              <td><em>Co-chair</em></td>
              <td><em>Serve</em></td>
            </tr>
            <tr>
              <td>Graduate Faculty</td>
              <td>Tenure Track</td>
              <td>Assistant, Associate, Full, Regents, Emeritus Professor</td>
              <td>Automatic</td>
              <td>Annual</td>
              <td>Automatic</td>
              <td>✔</td><td>✔</td><td>✔</td>
            </tr>
            <tr>
              <td>Auxiliary Graduate Faculty</td>
              <td>Short-term Track</td>
              <td>Adjunct</td>
              <td>By chair or director</td>
              <td>Three years</td>
              <td>Renewed every three years</td>
              <td></td><td>✔</td><td>✔</td>
            </tr>
          </tbody>
        </table>
      </main>`;
    const extracted = extractSourcedSectionFromHtml(membershipHtml, "faculty-of-the-graduate-school", BASE);
    expect(extracted?.fragmentHtml).toContain("<caption>");
    expect(extracted?.fragmentHtml).toContain("Membership and Roles of the Faculty of the Graduate School");
    expect(extracted?.fragmentHtml).toContain('colspan="3"');
    expect(extracted?.fragmentHtml).not.toMatch(/<th[^>]*colspan="9"/);

    const blocks = documentHtmlToBlocks(extracted!.fragmentHtml);
    const table = blocks.find((block) => block.type === "table");
    expect(table?.type).toBe("table");
    if (table?.type !== "table") {
      return;
    }
    expect(table.caption).toBe("Membership and Roles of the Faculty of the Graduate School");
    expect(table.hasHeaderRow).toBe(true);
    expect(table.rows[0]?.length).toBe(7);
    expect(table.colSpans?.[0]?.[6]).toBe(3);
    expect(table.rows[0]?.[6]).toMatch(/Allowed Committee Roles/);
    expect(table.rows[1]?.length).toBe(9);
    expect(table.rows[2]?.[0]).toBe("Graduate Faculty");
    expect(table.rows[3]?.[6]).toBe("");
    expect(table.rows[3]?.[7]).toBe("✔");

    const roundTrip = documentHtmlToBlocks(blocksToDocumentHtml([table]));
    const again = roundTrip.find((block) => block.type === "table");
    expect(again?.type).toBe("table");
    if (again?.type === "table") {
      expect(again.colSpans?.[0]?.[6]).toBe(3);
      expect(again.caption).toBe(table.caption);
    }
  });

  it("normalizes risky links and images before block parsing", () => {
    const extracted = extractSourcedSectionFromHtml(
      `<main>
        <h2 id="policy">Policy</h2>
        <p><a href="javascript:alert(1)">bad link</a><a href="mailto:gradschool@example.edu">email</a></p>
        <figure class="doc-image"><img src="data:image/svg+xml,<svg></svg>" alt="bad"></figure>
      </main>`,
      "policy",
      BASE,
    );
    expect(extracted?.fragmentHtml).not.toContain("javascript:");
    expect(extracted?.fragmentHtml).not.toContain("data:image");
    expect(extracted?.fragmentHtml).toContain('href="mailto:gradschool@example.edu"');
  });
});

describe("hashSourcedBlocks", () => {
  it("is stable across block-id re-minting and changes when content changes", () => {
    const extracted = extractSourcedSectionFromHtml(SOURCE_PAGE_HTML, "graduate-program-faculty", BASE);
    const first = documentHtmlToBlocks(extracted!.fragmentHtml);
    const second = documentHtmlToBlocks(extracted!.fragmentHtml);
    expect(first[0].blockId).not.toBe(second[0].blockId);
    expect(hashSourcedBlocks(first)).toBe(hashSourcedBlocks(second));

    const changed = documentHtmlToBlocks(extracted!.fragmentHtml.replace("appointed", "elected"));
    expect(hashSourcedBlocks(changed)).not.toBe(hashSourcedBlocks(first));
  });
});

describe("parseAllowedSourceUrl", () => {
  it("accepts only https URLs on allowlisted hosts", () => {
    expect(parseAllowedSourceUrl("https://gradschool.wsu.edu/x/#a")).not.toBeNull();
    expect(parseAllowedSourceUrl("http://gradschool.wsu.edu/x/")).toBeNull();
    expect(parseAllowedSourceUrl("https://evil.example.com/x/")).toBeNull();
    expect(parseAllowedSourceUrl("not a url")).toBeNull();
  });

  it("rejects common host and URL-shape bypasses", () => {
    expect(parseAllowedSourceUrl("https://gradschool.wsu.edu@evil.example.com/x/#a")).toBeNull();
    expect(parseAllowedSourceUrl("https://gradschool.wsu.edu.evil.example.com/x/#a")).toBeNull();
    expect(parseAllowedSourceUrl("https://gradschool.wsu.edu:4443/x/#a")).toBeNull();
    expect(parseAllowedSourceUrl("https://gradschool.wsu.edu/x/?next=http://127.0.0.1/#a")).toBeNull();
    expect(parseAllowedSourceUrl("https://grаdschool.wsu.edu/x/#a")).toBeNull();
  });
});

describe("fetchSourcedSection", () => {
  it("does not follow redirects from the allowlisted host", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 302, headers: { Location: "http://127.0.0.1/" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSourcedSection("https://gradschool.wsu.edu/graduate-school-policies-and-procedures/#graduate-program-faculty"),
    ).resolves.toEqual({ ok: false, reason: "unreachable" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gradschool.wsu.edu/graduate-school-policies-and-procedures/",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("rejects malformed anchors and oversized responses before parsing", async () => {
    await expect(fetchSourcedSection("https://gradschool.wsu.edu/x/#%E0%A4%A")).resolves.toEqual({
      ok: false,
      reason: "invalid_url",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<main></main>", { headers: { "content-length": "5000001" } })),
    );
    await expect(fetchSourcedSection("https://gradschool.wsu.edu/x/#a")).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});

describe("buildSourcedFromPastedHtml", () => {
  it("builds a sourced section from pasted HTML with the anchor from the URL hash", () => {
    const section = buildSourcedFromPastedHtml(
      "<p>Pasted policy text.</p>",
      "https://gradschool.wsu.edu/graduate-school-policies-and-procedures/#graduate-program-faculty",
      "Graduate Program Faculty",
    );
    expect(section).not.toBeNull();
    expect(section?.sourceAnchor).toBe("graduate-program-faculty");
    expect(section?.headingText).toBe("Graduate Program Faculty");
    expect(section?.blocks[0]).toMatchObject({ type: "paragraph", text: "Pasted policy text." });
    expect(section?.contentHash).toHaveLength(64);
  });

  it("rejects non-allowlisted URLs", () => {
    expect(buildSourcedFromPastedHtml("<p>x</p>", "https://evil.example.com/#a")).toBeNull();
  });

  it("rejects source URLs with query strings and malformed anchors", () => {
    expect(buildSourcedFromPastedHtml("<p>x</p>", "https://gradschool.wsu.edu/x/?next=http://127.0.0.1/#a")).toBeNull();
    expect(buildSourcedFromPastedHtml("<p>x</p>", "https://gradschool.wsu.edu/x/#%E0%A4%A")).toBeNull();
  });
});

describe("sourcedDefaultLabel", () => {
  it("prefers the document title with the numbered heading, falling back to the hostname", () => {
    expect(
      sourcedDefaultLabel({
        sourceUrl: "https://gradschool.wsu.edu/graduate-school-policies-and-procedures/",
        documentTitle: "2025-2026 Graduate School Policies and Procedures",
        headingText: "3.1.1 Doctoral Programs",
      }),
    ).toBe("2025-2026 Graduate School Policies and Procedures — 3.1.1 Doctoral Programs");
    expect(
      sourcedDefaultLabel({
        sourceUrl: "https://gradschool.wsu.edu/x/",
        headingText: "Some Section",
      }),
    ).toBe("gradschool.wsu.edu — Some Section");
  });
});

describe("sourced block serialization round-trip", () => {
  const sourcedBlock: Extract<ContentBlock, { type: "sourced" }> = {
    blockId: "block-src",
    type: "sourced",
    sourceUrl: "https://gradschool.wsu.edu/graduate-school-policies-and-procedures/",
    sourceAnchor: "graduate-program-faculty",
    label: "Graduate School P&P — Graduate Program Faculty",
    openInNewTab: true,
    headingText: "Graduate Program Faculty",
    retrievedAt: "2026-07-17T00:00:00.000Z",
    contentHash: "abc123",
    blocks: [{ blockId: "inner-p", type: "paragraph", text: "Policy text." }],
  };

  it("round-trips through editor HTML with metadata and nested blocks", () => {
    const parsed = documentHtmlToBlocks(blocksToDocumentHtml([sourcedBlock]));
    expect(parsed).toHaveLength(1);
    const roundTripped = parsed[0] as typeof sourcedBlock;
    expect(roundTripped).toMatchObject({
      blockId: "block-src",
      type: "sourced",
      sourceUrl: sourcedBlock.sourceUrl,
      sourceAnchor: "graduate-program-faculty",
      label: sourcedBlock.label,
      openInNewTab: true,
      headingText: "Graduate Program Faculty",
      retrievedAt: sourcedBlock.retrievedAt,
      contentHash: "abc123",
    });
    expect(roundTripped.blocks[0]).toMatchObject({ type: "paragraph", text: "Policy text." });
  });

  it("round-trips excerpt label and new-tab attributes", () => {
    const excerpt: ContentBlock = {
      blockId: "block-e",
      type: "excerpt",
      sourcePageId: "page-x",
      label: "Custom attribution",
      openInNewTab: true,
    };
    const parsed = documentHtmlToBlocks(blocksToDocumentHtml([excerpt]));
    expect(parsed[0]).toMatchObject({
      type: "excerpt",
      sourcePageId: "page-x",
      label: "Custom attribution",
      openInNewTab: true,
    });
  });
});

describe("publish gate recursion into sourced content", () => {
  it("flags an image without alt text inside sourced blocks", async () => {
    const issues = await validatePageForPublish(
      {
        title: "T",
        slug: "t",
        summary: "S",
        ownerLabel: "O",
        contactEmail: "o@wsu.edu",
        lastReviewedDate: "2026-07-17",
        blocks: [
          {
            blockId: "src",
            type: "sourced",
            sourceUrl: "https://gradschool.wsu.edu/x/",
            blocks: [{ blockId: "img", type: "image", url: "https://gradschool.wsu.edu/a.png" }],
          },
        ],
      },
      async () => "active",
    );
    expect(issues.some((issue) => issue.includes("missing alt text"))).toBe(true);
  });
});

describe("excerptAttributionLabel", () => {
  const resolved: Extract<ResolvedExcerpt, { state: "ok" }> = {
    state: "ok",
    kbTitle: "Graduate School KB",
    sourceTitle: "Maintaining Program Fact Sheets",
    sourceHref: "/kb/x/y",
    sectionTitle: "Before you begin",
    blocks: [],
  };

  it("names KB, page, and section by default and honors a custom label", () => {
    expect(excerptAttributionLabel(resolved)).toBe(
      "Graduate School KB: Maintaining Program Fact Sheets — Before you begin",
    );
    expect(excerptAttributionLabel(resolved, "  ")).toContain("Graduate School KB");
    expect(excerptAttributionLabel(resolved, "Fact Sheet access rules")).toBe("Fact Sheet access rules");
  });
});
