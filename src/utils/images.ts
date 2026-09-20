import type { ImageFormat, TransformationSettings, TransformImageRequest } from "../api/images.types";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Exclusive backend limit.
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
export const DEFAULT_SETTINGS: TransformationSettings = { width: "", height: "", quality: 80, format: "webp" };

export class ImageInputError extends Error {}

export function isImageFormat(value: unknown): value is ImageFormat {
  return value === "jpeg" || value === "png" || value === "webp";
}

// The backend detects MIME from bytes, not the extension or browser MIME header.
export async function validateImageFile(file: File): Promise<string> {
  if (!file.size) throw new ImageInputError("This file is empty. Choose a valid image.");
  if (file.size >= MAX_IMAGE_BYTES) {
    throw new ImageInputError("Choose an image smaller than 5 MiB (5,242,880 bytes).");
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if ([0xff, 0xd8, 0xff].every((value, index) => bytes[index] === value)) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  throw new ImageInputError("Unsupported or invalid image. Choose a JPEG, PNG, or WebP file.");
}

export async function prepareImagePreview(file: File) {
  const mimeType = await validateImageFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("No image dimensions");
    return { file, url, mimeType };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageInputError("This image could not be opened. It may be damaged. Choose another image.");
  }
}

export function buildTransformRequest(settings: TransformationSettings): TransformImageRequest {
  function dimension(value: string, label: string): number | undefined {
    if (!value.trim()) return undefined;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 4000) {
      throw new ImageInputError(`${label} must be a whole number from 1 to 4000, or left empty.`);
    }
    return number;
  }
  const width = dimension(settings.width, "Width");
  const height = dimension(settings.height, "Height");
  if (!Number.isInteger(settings.quality) || settings.quality < 1 || settings.quality > 100) {
    throw new ImageInputError("Quality must be a whole number from 1 to 100.");
  }
  if (!isImageFormat(settings.format)) throw new ImageInputError("Choose WebP, JPEG, or PNG as the output format.");
  return {
    transformations: {
      ...(width !== undefined || height !== undefined ? {
        resize: { ...(width !== undefined && { width }), ...(height !== undefined && { height }) },
      } : {}),
      quality: settings.quality,
      format: settings.format,
    },
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function calculateSizeReduction(original: number, processed: number | undefined): number | null {
  if (!Number.isFinite(original) || original <= 0 || processed === undefined || !Number.isFinite(processed) || processed < 0) return null;
  return ((original - processed) / original) * 100;
}

export function usableImageUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
