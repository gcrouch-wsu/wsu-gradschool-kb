import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  contrastRatio,
  mergeTheme,
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
    expect(themeToCssVars(DEFAULT_THEME)["--measure"]).toBe("72ch");
  });

  it("fills, clamps, and emits layout column widths", () => {
    expect(mergeTheme({}).layout).toEqual(DEFAULT_THEME.layout);

    const t = mergeTheme({ layout: { navWidth: "9999px", tocWidth: "50%" } });
    expect(t.layout.navWidth).toBe("480px");
    expect(t.layout.tocWidth).toBe(DEFAULT_THEME.layout.tocWidth);

    const vars = themeToCssVars(mergeTheme({ layout: { navWidth: "320px", tocWidth: "240px" } }));
    expect(vars["--nav-width"]).toBe("320px");
    expect(vars["--toc-width"]).toBe("240px");
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
