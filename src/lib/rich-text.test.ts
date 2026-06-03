import { describe, expect, it } from "vitest";
import { escapeHtml, richTextToPlainText, sanitizeRichText, textToRichText } from "@/lib/rich-text";

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });
});

describe("sanitizeRichText", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeRichText("")).toBe("");
  });

  it("keeps allowlisted inline formatting", () => {
    expect(sanitizeRichText("<strong>bold</strong> and <em>italic</em>")).toBe(
      "<strong>bold</strong> and <em>italic</em>",
    );
  });

  it("drops script tags and their contents", () => {
    expect(sanitizeRichText("<script>alert(1)</script>safe")).toBe("safe");
  });

  it("strips event-handler and other attributes from allowed tags", () => {
    expect(sanitizeRichText('<b onclick="steal()">x</b>')).toBe("<b>x</b>");
  });

  it("unwraps disallowed tags but keeps their text", () => {
    expect(sanitizeRichText("<div>text</div>")).toBe("text");
  });

  it("removes image tags entirely (no onerror vector)", () => {
    expect(sanitizeRichText('<img src=x onerror="alert(1)">')).toBe("");
  });

  it("drops anchors with unsafe schemes but keeps the text", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">click</a>')).toBe("click");
  });

  it("keeps safe anchors and forces rel=noopener", () => {
    const out = sanitizeRichText('<a href="https://wsu.edu">WSU</a>');
    expect(out).toContain('href="https://wsu.edu"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain(">WSU</a>");
  });

  it("allows mailto links", () => {
    expect(sanitizeRichText('<a href="mailto:a@wsu.edu">mail</a>')).toContain('href="mailto:a@wsu.edu"');
  });

  it("escapes ampersands inside anchor hrefs", () => {
    const out = sanitizeRichText('<a href="https://wsu.edu?a=1&b=2">x</a>');
    expect(out).toContain("a=1&amp;b=2");
  });
});

describe("richTextToPlainText", () => {
  it("strips markup to readable text", () => {
    expect(richTextToPlainText("<b>Hello</b> <i>world</i>")).toBe("Hello world");
  });

  it("collapses whitespace and line breaks", () => {
    expect(richTextToPlainText("a<br>b   c")).toBe("a b c");
  });
});

describe("textToRichText", () => {
  it("escapes and converts newlines to <br>", () => {
    expect(textToRichText("a<b\nc")).toBe("a&lt;b<br>c");
  });
});
