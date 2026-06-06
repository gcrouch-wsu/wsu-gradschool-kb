import { put } from "@vercel/blob";

/** Web-renderable image content types we will upload. Others (EMF/WMF/TIFF) are skipped. */
const SUPPORTED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const SUPPORTED_DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
};

/** True when a Vercel Blob read/write token is available (set automatically on Vercel). */
export function isBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isSupportedImageType(contentType: string) {
  return contentType.toLowerCase() in SUPPORTED_IMAGE_TYPES;
}

export function isSupportedDocumentType(contentType: string) {
  return contentType.toLowerCase() in SUPPORTED_DOCUMENT_TYPES;
}

function extensionFor(contentType: string): string | null {
  const normalized = contentType.toLowerCase();
  return SUPPORTED_IMAGE_TYPES[normalized] ?? SUPPORTED_DOCUMENT_TYPES[normalized] ?? null;
}

/**
 * Upload an imported image to Vercel Blob and return its public URL, or null if
 * the content type is not web-renderable. Throws only on a genuine upload error.
 */
export async function uploadImportImage(
  data: Buffer,
  contentType: string,
): Promise<string | null> {
  return uploadAssetBlob(data, contentType, "kb-imports");
}

/**
 * Upload a managed asset file to Vercel Blob. Returns the public URL or null when
 * the content type is unsupported.
 */
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
