import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  contrastRatio,
  mergeTheme,
  resolvePublicTheme,
  themeToCssVars,
  themeToEditorPalette,
} from "@/lib/kb-theme";

describe("kb-theme", () => {
  it("fills defaults for an empty/partial theme", () => {
    const t = mergeTheme({});
    expect(t.colors.ink).toBe(DEFAULT_THEME.colors.ink);
    expect(t.fonts.body).toBe("system");
    expect(t.scale.h2).toBe("1.75rem");
    expect(t.scale.h4).toBe(DEFAULT_THEME.scale.h4);
    expect(t.headingStyles.h1.weight).toBe("900");
  });

  it("rejects unsafe / malformed values and falls back to defaults", () => {
    const t = mergeTheme({
      colors: { ink: "red; } body { display:none", accent: "#abc", paper: "javascript:1", h4: "#123" },
      fonts: { body: "Comic Sans'; }", heading: "georgia", h1: "times", h2: "bad-font" },
      scale: { h1: "999px; evil", h2: "2rem", h4: "1.2rem" },
      headingStyles: {
        h1: { weight: "500", style: "italic", decoration: "underline", transform: "uppercase" },
        h2: { weight: "1000", style: "oblique", decoration: "blink", transform: "spin" },
      },
    });

    expect(t.colors.ink).toBe(DEFAULT_THEME.colors.ink);
    expect(t.colors.accent).toBe("#aabbcc");
    expect(t.colors.paper).toBe(DEFAULT_THEME.colors.paper);
    expect(t.fonts.body).toBe("system");
    expect(t.fonts.heading).toBe("georgia");
    expect(t.fonts.h1).toBe("times");
    expect(t.fonts.h2).toBe(DEFAULT_THEME.fonts.h2);
    expect(t.scale.h1).toBe(DEFAULT_THEME.scale.h1);
    expect(t.scale.h2).toBe("2rem");
    expect(t.scale.h4).toBe("1.2rem");
    expect(t.headingStyles.h1).toEqual({
      weight: "500",
      style: "italic",
      decoration: "underline",
      transform: "uppercase",
    });
    expect(t.headingStyles.h2).toEqual(DEFAULT_THEME.headingStyles.h2);
  });

  it("emits only safe CSS-variable values (no CSS injection)", () => {
    const vars = themeToCssVars(mergeTheme({ colors: { accent: "#123456" } }));
    for (const value of Object.values(vars)) {
      expect(value).not.toMatch(/[;{}<>]/);
    }
    expect(vars["--wsu-crimson"]).toBe("#123456");
    expect(vars["--h1-size"]).toContain("clamp(");
    expect(vars["--h4-size"]).toBe(DEFAULT_THEME.scale.h4);
    expect(vars["--h1-weight"]).toBe(DEFAULT_THEME.headingStyles.h1.weight);
  });

  it("clamps reading width and supports the no-limit value", () => {
    expect(mergeTheme({ typography: { measure: "120ch" } }).typography.measure).toBe("120ch");
    expect(mergeTheme({ typography: { measure: "500ch" } }).typography.measure).toBe("140ch");
    expect(mergeTheme({ typography: { measure: "12px" } }).typography.measure).toBe(DEFAULT_THEME.typography.measure);

    const unlimited = mergeTheme({ typography: { measure: "0ch" } });
    expect(unlimited.typography.measure).toBe("0ch");
    expect(themeToCssVars(unlimited)["--measure"]).toBe("100%");

    // Default is no limit; explicit values pass through.
    expect(themeToCssVars(DEFAULT_THEME)["--measure"]).toBe("100%");
    expect(themeToCssVars(mergeTheme({ typography: { measure: "72ch" } }))["--measure"]).toBe("72ch");
  });

  it("fills, clamps, and emits layout column widths", () => {
    expect(mergeTheme({}).layout).toEqual(DEFAULT_THEME.layout);
    expect(mergeTheme({}).layout.pageTreeCollapsible).toBe(false);

    const t = mergeTheme({
      layout: {
        navWidth: "9999px",
        tocWidth: "50%",
        pageTreeFontSize: "3rem",
        pageTreeItemGap: "0.1rem",
        pageTreeIndent: "2rem",
        pageTreeCollapsible: true,
        pageTreeGroupColor: "#ff00ff",
        pageTreeGroupWeight: "500",
        pageTreeGroupTracking: "9em",
        pageTreeGroupTransform: "capitalize",
      },
    });
    expect(t.layout.navWidth).toBe("480px");
    expect(t.layout.tocWidth).toBe(DEFAULT_THEME.layout.tocWidth);
    expect(t.layout.pageTreeFontSize).toBe("1.25rem");
    expect(t.layout.pageTreeItemGap).toBe("0.25rem");
    expect(t.layout.pageTreeIndent).toBe("1.5rem");
    expect(t.layout.pageTreeCollapsible).toBe(true);
    expect(t.layout.pageTreeGroupColor).toBe("#ff00ff");
    expect(t.layout.pageTreeGroupWeight).toBe("500");
    expect(t.layout.pageTreeGroupTracking).toBe("0.12em");
    expect(t.layout.pageTreeGroupTransform).toBe("capitalize");

    expect(mergeTheme({ layout: { pageTreeGroupWeight: "not-a-weight" } }).layout.pageTreeGroupWeight).toBe(
      DEFAULT_THEME.layout.pageTreeGroupWeight,
    );
    expect(
      mergeTheme({ layout: { pageTreeGroupTransform: "blink" } }).layout.pageTreeGroupTransform,
    ).toBe(DEFAULT_THEME.layout.pageTreeGroupTransform);

    const vars = themeToCssVars(
      mergeTheme({
        layout: {
          navWidth: "320px",
          tocWidth: "240px",
          pageTreeFontSize: "1rem",
          pageTreeItemGap: "0.8rem",
          pageTreeIndent: "1rem",
          pageTreeGroupColor: "#334455",
          pageTreeGroupWeight: "600",
          pageTreeGroupTracking: "0.02em",
          pageTreeGroupTransform: "uppercase",
        },
      }),
    );
    expect(vars["--nav-width"]).toBe("320px");
    expect(vars["--toc-width"]).toBe("240px");
    expect(vars["--page-tree-size"]).toBe("1rem");
    expect(vars["--page-tree-item-gap"]).toBe("0.8rem");
    expect(vars["--page-tree-indent"]).toBe("1rem");
    expect(vars["--page-tree-group-color"]).toBe("#334455");
    expect(vars["--page-tree-group-weight"]).toBe("600");
    expect(vars["--page-tree-group-tracking"]).toBe("0.02em");
    expect(vars["--page-tree-group-transform"]).toBe("uppercase");
  });

  it("pins global page-tree chrome when resolving a public KB theme", () => {
    const global = mergeTheme({
      layout: {
        navWidth: "300px",
        pageTreeFontSize: "1.05rem",
        pageTreeItemGap: "0.9rem",
        pageTreeIndent: "1rem",
        pageTreeCollapsible: false,
        pageTreeGroupColor: "#111111",
        pageTreeGroupWeight: "600",
        pageTreeGroupTracking: "0.03em",
        pageTreeGroupTransform: "capitalize",
      },
    });
    const resolved = resolvePublicTheme(
      {
        layout: {
          navWidth: "200px",
          pageTreeFontSize: "0.8rem",
          pageTreeCollapsible: true,
          pageTreeGroupColor: "#eeeeee",
          pageTreeGroupWeight: "300",
          pageTreeGroupTracking: "0em",
          pageTreeGroupTransform: "none",
        },
      },
      global,
    );
    expect(resolved.layout.navWidth).toBe("300px");
    expect(resolved.layout.pageTreeFontSize).toBe("1.05rem");
    expect(resolved.layout.pageTreeItemGap).toBe("0.9rem");
    expect(resolved.layout.pageTreeIndent).toBe("1rem");
    expect(resolved.layout.pageTreeCollapsible).toBe(true);
    expect(resolved.layout.pageTreeGroupColor).toBe("#111111");
    expect(resolved.layout.pageTreeGroupWeight).toBe("600");
    expect(resolved.layout.pageTreeGroupTracking).toBe("0.03em");
    expect(resolved.layout.pageTreeGroupTransform).toBe("capitalize");
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 1);
  });

  it("maps the editor palette font keys to safe stacks with a Default option", () => {
    const palette = themeToEditorPalette(DEFAULT_THEME);
    expect(palette.fonts[0]).toEqual({ label: "Default", value: "" });
    const arial = palette.fonts.find((o) => o.label === "Arial");
    expect(arial?.value).toContain("Arial");
  });
});
