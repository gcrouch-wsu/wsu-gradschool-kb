import { put } from "@vercel/blob";

const SUPPORTED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const SUPPORTED_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
};

export function isBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isSupportedImageType(contentType: string) {
  return contentType.toLowerCase() in SUPPORTED_IMAGE_TYPES;
}

export function isSupportedDocumentType(contentType: string) {
  return contentType.toLowerCase() in SUPPORTED_DOCUMENT_TYPES;
}

export function isTrustedAssetUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  return (
    url.hostname === "blob.vercel-storage.com" ||
    url.hostname.endsWith(".public.blob.vercel-storage.com")
  );
}

function extensionFor(contentType: string): string | null {
  const normalized = contentType.toLowerCase();
  return SUPPORTED_IMAGE_TYPES[normalized] ?? SUPPORTED_DOCUMENT_TYPES[normalized] ?? null;
}

export async function uploadImportImage(
  data: Buffer,
  contentType: string,
): Promise<string | null> {
  return uploadAssetBlob(data, contentType, "kb-imports");
}

export async function uploadAssetBlob(
  data: Buffer,
  contentType: string,
  prefix = "kb-assets",
): Promise<string | null> {
  const normalized = contentType.toLowerCase();
  const extension = extensionFor(normalized);
  if (!extension) {
    return null;
  }

  const pathname = `${prefix}/${crypto.randomUUID()}.${extension}`;
  const blob = await put(pathname, data, {
    access: "public",
    contentType: normalized,
  });
  return blob.url;
}
