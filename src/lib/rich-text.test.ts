import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  richTextToPlainText,
  sanitizeListItemHtml,
  sanitizeRichText,
  textToRichText,
} from "@/lib/rich-text";

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

  it("keeps allowlisted span font styles", () => {
    const out = sanitizeRichText(
      '<span style="font-family: Georgia, serif; font-size: 1.125rem; color: #981e32">styled</span>',
    );
    expect(out).toContain('style="font-family: Georgia, serif; font-size: 1.125rem; color: #981e32"');
    expect(out).toContain(">styled</span>");
  });

  it("keeps toolbar colors when the browser emits rgb()", () => {
    const out = sanitizeRichText('<span style="color: rgb(152, 30, 50)">Crimson</span>');
    expect(out).toBe('<span style="color: #981e32">Crimson</span>');
  });

  it("keeps toolbar font sizes when the browser emits px", () => {
    const out = sanitizeRichText('<span style="font-size: 18px">Large</span>');
    expect(out).toBe('<span style="font-size: 1.125rem">Large</span>');
  });

  it("keeps toolbar fonts when quotes differ", () => {
    const out = sanitizeRichText('<span style="font-family: Times New Roman, Times, serif">T</span>');
    expect(out).toContain("Times New Roman");
    expect(out).toContain(">T</span>");
  });

  it("drops unsafe span styles and unwraps empty spans", () => {
    expect(sanitizeRichText('<span style="background: red">x</span>')).toBe("x");
    expect(sanitizeRichText('<span style="color: expression(alert(1))">x</span>')).toBe("x");
  });

  it("converts legacy font tags to sanitized spans", () => {
    const out = sanitizeRichText('<font face="Arial, Helvetica, sans-serif" color="#981e32">x</font>');
    expect(out).toContain('style="font-family: Arial, Helvetica, sans-serif; color: #981e32"');
    expect(out).toContain(">x</span>");
  });

  it("converts execCommand font size tags to rem spans", () => {
    const out = sanitizeRichText('<font size="4">Large</font>');
    expect(out).toContain('font-size: 1.125rem');
  });
});

describe("sanitizeListItemHtml", () => {
  it("keeps nested lists inside a list item", () => {
    const out = sanitizeListItemHtml('Item <ul><li>Nested</li></ul>');
    expect(out).toBe("Item <ul><li>Nested</li></ul>");
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
