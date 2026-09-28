import type { ImageMetadata, PaginatedImagesResponse } from "../api/images.types";

export interface ImageGroup {
  key: string;
  original: ImageMetadata | null;
  versions: ImageMetadata[];
  standalone: ImageMetadata | null;
}

export const IMAGE_GROUPS_PER_PAGE = 10;

export function paginateImageGroups(groups: ImageGroup[], page = 1, limit = IMAGE_GROUPS_PER_PAGE) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Choose a positive whole-number group page and page size.");
  }
  const total = groups.length;
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const start = (currentPage - 1) * limit;
  return { items: groups.slice(start, start + limit), page: currentPage, limit, total, totalPages,
    from: total ? start + 1 : 0, to: Math.min(start + limit, total) };
}

// Keep the API's newest-first order, anchored by each group's newest record.
export function groupImagesByOriginal(items: ImageMetadata[]): ImageGroup[] {
  const groups = new Map<string, ImageGroup>();
  for (const image of items) {
    const originalId = image.kind === "original" ? image._id : image.kind === "transformed" ? image.originalImageId : undefined;
    const key = originalId ? `original:${originalId}` : `record:${image._id}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, original: null, versions: [], standalone: null };
      groups.set(key, group);
    }
    if (image.kind === "original") group.original = image;
    else if (image.kind === "transformed" && originalId) group.versions.push(image);
    else group.standalone = image;
  }
  return [...groups.values()];
}

export function validHistoryPage(result: PaginatedImagesResponse): number {
  if (result.items.length || result.page === 1) return result.page;
  return Math.max(1, Math.min(result.page - 1, result.totalPages));
}

// Refresh on demand shortly before expiry. Unknown expiry is treated conservatively.
export function isPresignedUrlExpired(expiresAt: string | undefined, now = Date.now(), bufferMs = 30000): boolean {
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
  return !Number.isFinite(expiry) || expiry <= now + bufferMs;
}

export function imageKindLabel(image: ImageMetadata): string {
  return image.kind === "original" ? "Original" : image.kind === "transformed" ? "Processed version" : "Legacy image";
}

export function imageDeleteMessage(image: ImageMetadata): string {
  if (image.kind === "original") return "Deleting this original will also delete all of its transformed versions. This cannot be undone.";
  if (image.kind === "transformed") return "Delete this processed version? The original image and other versions will be kept. This cannot be undone.";
  return "Delete this legacy image? Only this saved image will be removed. This cannot be undone.";
}

export function imageDate(value: string | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
