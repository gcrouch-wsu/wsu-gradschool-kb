import sharp from "sharp";

const ALLOWED_WIDTHS = new Set([320, 640, 960, 1280, 1600]);

export function parseImageWidthParam(raw: string | null): number | null {
  if (!raw) return null;
  const width = Number.parseInt(raw, 10);
  if (!Number.isFinite(width) || !ALLOWED_WIDTHS.has(width)) {
    return null;
  }
  return width;
}

export function isResizableImageMime(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return (
    normalized.includes("png") ||
    normalized.includes("jpeg") ||
    normalized.includes("jpg") ||
    normalized.includes("webp") ||
    normalized.includes("gif")
  );
}

/** Resize an image buffer to a max width (WebP). Animated GIFs are left unchanged. */
export async function resizeImageBuffer(
  input: Buffer,
  mimeType: string,
  width: number,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!isResizableImageMime(mimeType)) {
    return null;
  }
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("gif")) {
    // Keep animated GIFs intact.
    return null;
  }
  try {
    const body = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { body, contentType: "image/webp" };
  } catch {
    return null;
  }
}

export const IMAGE_SRCSET_WIDTHS = [640, 1280] as const;

export function buildManagedImageSrcSet(baseSrc: string): string {
  return IMAGE_SRCSET_WIDTHS.map((width) => {
    const url = new URL(baseSrc, "https://kb.local");
    url.searchParams.set("w", String(width));
    return `${url.pathname}${url.search} ${width}w`;
  }).join(", ");
}
