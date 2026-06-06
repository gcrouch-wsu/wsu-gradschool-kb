export type VideoProvider = "youtube" | "vimeo" | "direct";

export interface ParsedVideo {
  provider: VideoProvider;
  embedId?: string;
}

/**
 * Parse a pasted video URL into a provider + embed id. YouTube and Vimeo are
 * recognized; anything else is treated as a direct (self-hosted) URL.
 */
export function parseVideoUrl(url: string): ParsedVideo {
  const trimmed = url.trim();

  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i,
  );
  if (ytMatch) {
    return { provider: "youtube", embedId: ytMatch[1] };
  }

  const vimeoMatch = trimmed.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/i);
  if (vimeoMatch) {
    return { provider: "vimeo", embedId: vimeoMatch[1] };
  }

  return { provider: "direct" };
}

/** Provider implied by a managed video asset's synthetic mime type (video/x-<provider>). */
export function providerFromMime(mimeType: string): VideoProvider {
  const suffix = mimeType.split("/")[1]?.replace(/^x-/, "");
  return suffix === "youtube" || suffix === "vimeo" ? suffix : "direct";
}
