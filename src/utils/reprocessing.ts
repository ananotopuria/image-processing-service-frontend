import type { ImageMetadata } from "../api/images.types";
import { ImageInputError } from "./images";

export function originalIdForImage(image: ImageMetadata): string | null {
  const id = image.kind === "original" ? image._id : image.originalImageId;
  return id && /^[a-f\d]{24}$/i.test(id) ? id : null;
}

export function savedOriginalUrl(image: ImageMetadata): string | null {
  const id = originalIdForImage(image);
  return id ? `/upload?originalId=${encodeURIComponent(id)}` : null;
}

export function requireOriginal(image: ImageMetadata): ImageMetadata {
  if (image.kind !== "original") {
    throw new ImageInputError("This record is not a saved original. Open its original from Images, or upload the original file again.");
  }
  return image;
}

export function withoutSavedOriginal(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete("originalId");
  return next;
}
