import { describe, expect, it } from "vitest";
import { isSupportedImageType } from "@/lib/blob";

describe("blob type allowlists", () => {
  it("rejects SVG as an image upload type", () => {
    expect(isSupportedImageType("image/svg+xml")).toBe(false);
  });

  it("allows raster image upload types", () => {
    expect(isSupportedImageType("image/png")).toBe(true);
    expect(isSupportedImageType("image/jpeg")).toBe(true);
    expect(isSupportedImageType("image/gif")).toBe(true);
    expect(isSupportedImageType("image/webp")).toBe(true);
  });
});
