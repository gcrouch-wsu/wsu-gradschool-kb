export type VideoProvider = "youtube" | "vimeo" | "direct";

export interface ParsedVideo {
  provider: VideoProvider;
  embedId?: string;
}

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

export function providerFromMime(mimeType: string): VideoProvider {
  const suffix = mimeType.split("/")[1]?.replace(/^x-/, "");
  return suffix === "youtube" || suffix === "vimeo" ? suffix : "direct";
}

export function videoDeliveryUrl(input: {
  videoProvider?: VideoProvider | null;
  videoExternalId?: string | null;
  videoUrl?: string | null;
  body?: string | null;
}): string | null {
  if (input.videoProvider === "youtube" && input.videoExternalId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(input.videoExternalId)}`;
  }
  if (input.videoProvider === "vimeo" && input.videoExternalId) {
    return `https://vimeo.com/${encodeURIComponent(input.videoExternalId)}`;
  }
  const raw = (input.videoUrl || input.body || "").trim();
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
