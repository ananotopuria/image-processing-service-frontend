import { apiClient } from "./client";
import type { ImageMetadata, TransformImageRequest } from "./images.types";
import { ImageInputError, isImageFormat, isImageTransformations, validateImageFile } from "../utils/images";

function readImageResponse(data: unknown, expectedKind: ImageMetadata["kind"]): ImageMetadata {
  if (!data || typeof data !== "object") throw invalidResponse();
  const record = data as Record<string, unknown>;
  const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  if (
    typeof record._id !== "string" || !/^[a-f\d]{24}$/i.test(record._id) || record.kind !== expectedKind ||
    typeof record.originalName !== "string" || typeof record.filename !== "string" || typeof record.path !== "string" ||
    !isImageFormat(record.format) || !positiveInteger(record.originalSize)
  ) throw invalidResponse();
  if (expectedKind === "transformed" && (
    typeof record.originalImageId !== "string" || !/^[a-f\d]{24}$/i.test(record.originalImageId) ||
    !positiveInteger(record.width) || !positiveInteger(record.height) || !positiveInteger(record.processedSize) ||
    !positiveInteger(record.quality) || record.quality > 100
  )) throw invalidResponse();
  for (const field of ["url", "downloadUrl", "urlExpiresAt"] as const) {
    if (record[field] !== undefined && typeof record[field] !== "string") throw invalidResponse();
  }
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
  return readImageResponse(data, "original");
}

export async function transformImage(originalId: string, body: TransformImageRequest, signal: AbortSignal): Promise<ImageMetadata> {
  const { data } = await apiClient.post<unknown>(`/api/images/${encodeURIComponent(originalId)}/transform`, body, { signal, timeout: 120000 });
  const image = readImageResponse(data, "transformed");
  if (image.originalImageId !== originalId) throw invalidResponse();
  return image;
}

export async function refreshImageLinks(imageId: string, signal: AbortSignal): Promise<ImageMetadata> {
  const { data } = await apiClient.get<unknown>(`/api/images/${encodeURIComponent(imageId)}`, { signal });
  const image = readImageResponse(data, "transformed");
  if (image._id !== imageId) throw invalidResponse();
  return image;
}
