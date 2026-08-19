import { describe, expect, it } from "vitest";
import { buildManagedImageSrcSet } from "@/lib/image-srcset";
import { parseImageWidthParam } from "@/lib/image-variants";

describe("image-variants", () => {
  it("accepts only allow-listed widths", () => {
    expect(parseImageWidthParam("640")).toBe(640);
    expect(parseImageWidthParam("641")).toBeNull();
    expect(parseImageWidthParam(null)).toBeNull();
  });

  it("builds a managed-file srcset", () => {
    expect(buildManagedImageSrcSet("/kb/grad/files/photo")).toBe(
      "/kb/grad/files/photo?w=640 640w, /kb/grad/files/photo?w=1280 1280w",
    );
  });
});
