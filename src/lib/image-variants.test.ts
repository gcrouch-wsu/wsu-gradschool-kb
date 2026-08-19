import { readFileSync } from "node:fs";
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

  // sharp is a native module. Importing it from a page render crashed SSR on
  // Vercel, which is why srcset building lives in its own sharp-free module and
  // resizeImageBuffer loads sharp through a dynamic import in the file route.
  it("keeps the srcset helper and the public renderer free of sharp", () => {
    const srcsetSource = readFileSync("src/lib/image-srcset.ts", "utf8");
    expect(srcsetSource).not.toMatch(/sharp/);
    expect(srcsetSource).not.toMatch(/image-variants/);

    const pageBlocksSource = readFileSync("src/components/PageBlocks.tsx", "utf8");
    expect(pageBlocksSource).not.toMatch(/from "@\/lib\/image-variants"/);
    expect(pageBlocksSource).toMatch(/from "@\/lib\/image-srcset"/);

    // Even in the resize module, sharp must stay behind a dynamic import.
    const variantsSource = readFileSync("src/lib/image-variants.ts", "utf8");
    expect(variantsSource).not.toMatch(/^import .*"sharp"/m);
    expect(variantsSource).toMatch(/await import\("sharp"\)/);
  });
});
