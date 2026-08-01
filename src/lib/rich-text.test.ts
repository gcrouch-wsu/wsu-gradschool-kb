import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  richTextToPlainText,
  sanitizeCalloutHtml,
  sanitizeListItemHtml,
  sanitizeRichText,
  textToRichText,
} from "@/lib/rich-text";

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });
});

describe("editor-note spans", () => {
  const noteHtml =
    'Before <span class="doc-note" data-note-id="note-1" data-note-body="check this">anchored</span> after';

  it("strips note spans by default (public render keeps only the text)", () => {
    const out = sanitizeRichText(noteHtml);
    expect(out).toContain("anchored");
    expect(out).not.toContain("doc-note");
    expect(out).not.toContain("data-note-body");
    expect(out).not.toContain("check this");
  });

  it("preserves note spans (with escaped body) when keepNotes is set", () => {
    const out = sanitizeRichText(noteHtml, { keepNotes: true });
    expect(out).toContain('class="doc-note"');
    expect(out).toContain('data-note-id="note-1"');
    expect(out).toContain('data-note-body="check this"');
    expect(out).toContain("anchored");
  });

  it("strips unsafe characters from the note id", () => {
    const evil = '<span class="doc-note" data-note-id="bad id 123!@#" data-note-body="ok body">t</span>';
    const out = sanitizeRichText(evil, { keepNotes: true });
    expect(out).toContain('data-note-id="badid123"');
    expect(out).toContain('data-note-body="ok body"');
  });

  it("keeps note body out of plain text (and therefore search)", () => {
    expect(richTextToPlainText(noteHtml)).toBe("Before anchored after");
  });

  it("preserves point note markers for editor storage and strips them publicly", () => {
    const pointNote =
      'Before<span class="doc-note doc-note--point" data-note-id="note-2" data-note-body="check punctuation"></span> after';
    const stored = sanitizeRichText(pointNote, { keepNotes: true });
    expect(stored).toContain('class="doc-note doc-note--point"');
    expect(stored).toContain('data-note-body="check punctuation"');
    const publicHtml = sanitizeRichText(pointNote);
    expect(publicHtml).toBe("Before after");
    expect(publicHtml).not.toContain("check punctuation");
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
    expect(sanitizeRichText('<b onclick="steal()">x</b>')).toBe("<strong>x</strong>");
  });

  describe("emphasis normalization", () => {
    it("rewrites presentational b/i to semantic strong/em", () => {
      expect(sanitizeRichText("<b>bold</b>")).toBe("<strong>bold</strong>");
      expect(sanitizeRichText("<i>italic</i>")).toBe("<em>italic</em>");
    });

    // The editor formats through two paths — document.execCommand emits <b>, Lexical emits
    // <strong> — so a run touched by both arrived as <b><strong>text</strong></b> and grew
    // no further only because the tags were already nested. Saving handed it straight back.
    it("collapses b/strong double-wrapping to a single strong", () => {
      expect(sanitizeRichText("<b><strong>text</strong></b>")).toBe("<strong>text</strong>");
      expect(sanitizeRichText("<strong><b>text</b></strong>")).toBe("<strong>text</strong>");
      expect(sanitizeRichText("<i><em>text</em></i>")).toBe("<em>text</em>");
    });

    it("is idempotent across repeated saves", () => {
      const once = sanitizeRichText("<b><strong>text</strong></b>");
      expect(sanitizeRichText(once)).toBe(once);
    });

    it("keeps distinct emphasis nested together", () => {
      expect(sanitizeRichText("<b><em>both</em></b>")).toBe("<strong><em>both</em></strong>");
    });

    it("keeps separate sibling runs intact", () => {
      expect(sanitizeRichText("<b>one</b> plain <b>two</b>")).toBe(
        "<strong>one</strong> plain <strong>two</strong>",
      );
    });

    it("drops emphasis that wraps nothing", () => {
      expect(sanitizeRichText("<b></b>")).toBe("");
    });

    it("preserves inner markup when unwrapping a duplicate", () => {
      expect(sanitizeRichText('<strong><b>see <a href="/kb/x">the page</a></b></strong>')).toBe(
        '<strong>see <a href="/kb/x" rel="noopener noreferrer">the page</a></strong>',
      );
    });
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

  it("preserves data-asset-id on anchors for document usage tracking", () => {
    const out = sanitizeRichText(
      '<a href="/kb/grad/files/handbook" data-asset-id="asset-handbook-1">handbook</a>',
      { keepNotes: true },
    );
    expect(out).toContain('href="/kb/grad/files/handbook"');
    expect(out).toContain('data-asset-id="asset-handbook-1"');
    expect(out).toContain("handbook");
  });

  it("strips unsafe characters from data-asset-id", () => {
    const out = sanitizeRichText(
      '<a href="/kb/grad/files/x" data-asset-id=\'asset-1" onmouseover=alert(1)\'>x</a>',
      { keepNotes: true },
    );
    expect(out).toMatch(/data-asset-id="asset-1[^"]*"/);
    expect(out).not.toContain(" onmouseover=");
    expect(out).not.toContain("alert(");
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

describe("sanitizeCalloutHtml", () => {
  it("keeps inline formatting and nested lists", () => {
    const out = sanitizeCalloutHtml(
      '<h2>Heading</h2><strong>Read</strong><ol start="2"><li>First<ul><li>Nested</li></ul></li></ol>',
    );
    expect(out).toContain("Heading");
    expect(out).not.toContain("<h2");
    expect(out).toContain("<strong>Read</strong>");
    expect(out).toContain('<ol start="2"><li>First<ul><li>Nested</li></ul></li></ol>');
  });

  it("drops structural content that should not live inside info boxes", () => {
    const out = sanitizeCalloutHtml('<table><tr><td>Cell</td></tr></table><figure><img src="/x.png"></figure>');
    expect(out).toContain("Cell");
    expect(out).not.toContain("<table");
    expect(out).not.toContain("<figure");
    expect(out).not.toContain("<img");
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
