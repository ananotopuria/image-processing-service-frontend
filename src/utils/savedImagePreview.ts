import type { ImageMetadata } from "../api/images.types";
import { isPresignedUrlExpired } from "./imageHistory";
import { ImageInputError, preparePreview, usableImageUrl } from "./images";

// These bytes are used only for an EXIF-normalized crop preview, never for upload.
// Storage requests use the signed URL directly and never receive the API token.
export async function loadSavedImagePreview(image: ImageMetadata, signal: AbortSignal) {
  const url = usableImageUrl(image.url);
  if (!url || isPresignedUrlExpired(image.urlExpiresAt)) {
    throw new ImageInputError("The original preview link is unavailable or expired. Refresh the preview to try again.");
  }
  signal.throwIfAborted();
  const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new ImageInputError("The original preview could not be loaded. Refresh the preview to try again.");
  const blob = await response.blob();
  signal.throwIfAborted();
  const preview = await preparePreview(blob);
  if (signal.aborted) {
    URL.revokeObjectURL(preview.url);
    signal.throwIfAborted();
  }
  return preview;
}
