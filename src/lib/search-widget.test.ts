import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_SETTINGS, normalizeSiteSettings } from "@/lib/site-settings";

describe("home search setting", () => {
  it("defaults showHomeSearch off and round-trips an explicit value", () => {
    expect(DEFAULT_SITE_SETTINGS.showHomeSearch).toBe(false);
    expect(normalizeSiteSettings({}).showHomeSearch).toBe(false);
    expect(normalizeSiteSettings({ showHomeSearch: true }).showHomeSearch).toBe(true);
    expect(normalizeSiteSettings({ showHomeSearch: "yes" }).showHomeSearch).toBe(false);
  });
});
