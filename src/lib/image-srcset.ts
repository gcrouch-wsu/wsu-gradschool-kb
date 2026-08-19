export const IMAGE_SRCSET_WIDTHS = [640, 1280] as const;

export function buildManagedImageSrcSet(baseSrc: string): string {
  return IMAGE_SRCSET_WIDTHS.map((width) => {
    const url = new URL(baseSrc, "https://kb.local");
    url.searchParams.set("w", String(width));
    return `${url.pathname}${url.search} ${width}w`;
  }).join(", ");
}
