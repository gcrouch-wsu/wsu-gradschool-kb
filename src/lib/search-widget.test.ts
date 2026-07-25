import { describe, expect, it } from "vitest";
import { DEFAULT_AI_SUMMARY_SYSTEM_PROMPT, buildSummaryDraftPrompt } from "@/lib/summary-draft-core";
import { DEFAULT_SITE_SETTINGS, normalizeSiteSettings } from "@/lib/site-settings";

describe("home search setting", () => {
  it("defaults showHomeSearch off and round-trips an explicit value", () => {
    expect(DEFAULT_SITE_SETTINGS.showHomeSearch).toBe(false);
    expect(normalizeSiteSettings({}).showHomeSearch).toBe(false);
    expect(normalizeSiteSettings({ showHomeSearch: true }).showHomeSearch).toBe(true);
    expect(normalizeSiteSettings({ showHomeSearch: "yes" }).showHomeSearch).toBe(false);
  });
});

describe("ai summary prompt setting", () => {
  it("defaults empty and accepts a custom prompt", () => {
    expect(DEFAULT_SITE_SETTINGS.aiSummaryPrompt).toBe("");
    expect(normalizeSiteSettings({}).aiSummaryPrompt).toBe("");
    expect(normalizeSiteSettings({ aiSummaryPrompt: "  Be concise.  " }).aiSummaryPrompt).toBe("Be concise.");
  });

  it("uses the custom system prompt when drafting", () => {
    const prompt = buildSummaryDraftPrompt("Title", "Body text ".repeat(30), "Custom system rules.");
    expect(prompt.system).toBe("Custom system rules.");
    expect(prompt.user).toContain("Title");
  });

  it("falls back to the built-in default when blank", () => {
    const prompt = buildSummaryDraftPrompt("Title", "Body text ".repeat(30), "   ");
    expect(prompt.system).toBe(DEFAULT_AI_SUMMARY_SYSTEM_PROMPT);
  });
});
