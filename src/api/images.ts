import { favoriteState } from "../utils/favorites";
import { getRetryAfterDeadline } from "./imageErrors";
import { apiClient } from "./client";
import type { FavoriteResponse, ImageMetadata, PaginatedImagesResponse, TransformImageRequest } from "./images.types";
import { ImageInputError, isImageFormat, isImageTransformations, validateImageFile } from "../utils/images";

function readImageResponse(data: unknown, expectedKind?: ImageMetadata["kind"]): ImageMetadata {
  if (!data || typeof data !== "object") throw invalidResponse();
  const record = data as Record<string, unknown>;
  const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  if (
    typeof record._id !== "string" || !/^[a-f\d]{24}$/i.test(record._id) ||
    (expectedKind !== undefined && record.kind !== expectedKind) ||
    (record.kind !== undefined && record.kind !== "original" && record.kind !== "transformed") ||
    typeof record.originalName !== "string" || typeof record.filename !== "string" || typeof record.isFavorite !== "boolean" ||
    !isImageFormat(record.format) || !positiveInteger(record.originalSize)
  ) throw invalidResponse();
  if (expectedKind === "transformed" && (
    typeof record.originalImageId !== "string" || !/^[a-f\d]{24}$/i.test(record.originalImageId) ||
    !positiveInteger(record.width) || !positiveInteger(record.height) || !positiveInteger(record.processedSize) ||
    !positiveInteger(record.quality) || record.quality > 100
  )) throw invalidResponse();
  for (const field of ["url", "downloadUrl", "urlExpiresAt", "createdAt", "updatedAt"] as const) {
    if (record[field] !== undefined && typeof record[field] !== "string") throw invalidResponse();
  }
  for (const field of ["width", "height", "quality", "processedSize"] as const) {
    if (record[field] !== undefined && !positiveInteger(record[field])) throw invalidResponse();
  }
  if (record.quality !== undefined && Number(record.quality) > 100) throw invalidResponse();
  if (record.originalImageId !== undefined && (typeof record.originalImageId !== "string" || !/^[a-f\d]{24}$/i.test(record.originalImageId))) throw invalidResponse();
  if (record.transformations !== undefined && !isImageTransformations(record.transformations)) throw invalidResponse();
  return record as unknown as ImageMetadata;
}

function invalidResponse() {
  return new ImageInputError("The server returned incomplete image details. The image may already have been saved.");
}

export async function createUploadFormData(file: File): Promise<FormData> {
  await validateImageFile(file);
  const data = new FormData();
  data.append("file", file);
  return data;
}

export async function uploadImage(file: File, signal: AbortSignal): Promise<ImageMetadata> {
  const form = await createUploadFormData(file);
  // Let the browser set multipart Content-Type, including its generated boundary.
  const { data } = await apiClient.post<unknown>("/api/images/upload", form, { signal });
  return { ...readImageResponse(data, "original"), isFavorite: false };
}

export async function transformImage(originalId: string, body: TransformImageRequest, signal: AbortSignal): Promise<ImageMetadata> {
  const { data } = await apiClient.post<unknown>(`/api/images/${encodeURIComponent(originalId)}/transform`, body, { signal, timeout: 120000 });
  const image = readImageResponse(data, "transformed");
  if (image.originalImageId !== originalId) throw invalidResponse();
  return { ...image, isFavorite: false };
}

export async function getImageById(imageId: string, signal: AbortSignal): Promise<ImageMetadata> {
  const ticket = favoriteState.read();
  const { data } = await apiClient.get<unknown>(`/api/images/${encodeURIComponent(imageId)}`, { signal });
  const image = readImageResponse(data);
  if (image._id !== imageId) throw invalidResponse();
  return favoriteState.accept([image], ticket)[0];
}

// Preserve the studio's existing helper; all records share the same refresh endpoint.
export { getImageById as refreshImageLinks };

export function getImages(page = 1, limit = 10, signal?: AbortSignal) {
  return getImagePage("/api/images", page, limit, signal);
}

export async function getFavoriteImages(page = 1, limit = 10, signal?: AbortSignal) {
  return favoriteRequest(() => getImagePage("/api/images/favorites", page, limit, signal));
}

async function getImagePage(endpoint: string, page: number, limit: number, signal?: AbortSignal): Promise<PaginatedImagesResponse> {
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new ImageInputError("Choose a valid image page and a page size from 1 to 50.");
  }
  const ticket = favoriteState.read();
  const { data } = await apiClient.get<unknown>(endpoint, { params: { page, limit }, signal });
  if (!data || typeof data !== "object") throw invalidHistoryResponse();
  const result = data as Record<string, unknown>;
  if (
    !Array.isArray(result.items) || result.items.length > limit || result.page !== page || result.limit !== limit ||
    typeof result.total !== "number" || !Number.isSafeInteger(result.total) || result.total < 0 ||
    result.totalPages !== Math.ceil(result.total / limit)
  ) throw invalidHistoryResponse();
  let items: ImageMetadata[];
  try { items = result.items.map((item) => readImageResponse(item)); }
  catch { throw invalidHistoryResponse(); }
  if (new Set(items.map((item) => item._id)).size !== items.length) throw invalidHistoryResponse();
  if (endpoint === "/api/images/favorites" && items.some((image) => !image.isFavorite)) throw invalidHistoryResponse();
  items = favoriteState.accept(items, ticket);
  return { items, page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) };
}

function invalidHistoryResponse() {
  return new ImageInputError("The server returned incomplete image history. Please refresh the gallery.");
}

// The API paginates records, not original/version groups. Collect the complete
// metadata set before grouping so a server page boundary cannot split a card.
export async function getImageArchive(signal: AbortSignal): Promise<ImageMetadata[]> {
  const limit = 50;
  const first = await getImages(1, limit, signal);
  const items: ImageMetadata[] = [];
  const seen = new Set<string>();
  if (first.totalPages > 100000) {
    throw new ImageInputError("This archive exceeds the service's pagination range.");
  }
  function append(result: PaginatedImagesResponse) {
    const expected = Math.min(limit, Math.max(0, first.total - (result.page - 1) * limit));
    if (result.total !== first.total || result.items.length !== expected || result.items.some((image) => seen.has(image._id))) {
      throw new ImageInputError("Your archive changed while loading. Retry to load complete image groups.");
    }
    for (const image of result.items) {
      seen.add(image._id);
      items.push(image);
    }
  }
  append(first);
  for (let page = 2; page <= first.totalPages; page++) {
    signal.throwIfAborted();
    append(await getImages(page, limit, signal));
  }
  signal.throwIfAborted();
  return items;
}

export async function deleteImage(imageId: string, signal: AbortSignal): Promise<void> {
  const { data } = await apiClient.delete<unknown>(`/api/images/${encodeURIComponent(imageId)}`, { signal });
  if (!data || typeof data !== "object" || !("message" in data) || data.message !== "Image deleted successfully") {
    throw new ImageInputError("Deletion could not be confirmed. Refresh the gallery before trying again.");
  }
}

async function favoriteRequest<T>(send: () => Promise<T>): Promise<T> {
  if (favoriteState.getSnapshot().retryAt > Date.now()) {
    throw new ImageInputError("Too many favorite requests. Wait before trying again.");
  }
  const ticket = favoriteState.read();
  try { return await send(); }
  catch (error) {
    const deadline = getRetryAfterDeadline(error);
    if (deadline && favoriteState.current(ticket)) favoriteState.rateLimit(deadline);
    throw error;
  }
}

export async function setImageFavorite(imageId: string, isFavorite: boolean, signal: AbortSignal): Promise<FavoriteResponse> {
  return favoriteRequest(async () => {
    const path = `/api/images/${encodeURIComponent(imageId)}/favorite`;
    const { data } = isFavorite
      ? await apiClient.put<unknown>(path, undefined, { signal })
      : await apiClient.delete<unknown>(path, { signal });
    if (!data || typeof data !== "object" || !("imageId" in data) || data.imageId !== imageId ||
      !("isFavorite" in data) || typeof data.isFavorite !== "boolean") {
      throw new ImageInputError("The favorite change could not be confirmed. Refresh your images to check its saved state.");
    }
    return { imageId, isFavorite: data.isFavorite };
  });
}
