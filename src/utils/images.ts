import type { ImageFormat, ImageTransformations, TransformationSettings, TransformImageRequest } from "../api/images.types";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Exclusive backend limit.
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
export const DEFAULT_SETTINGS: Readonly<TransformationSettings> = Object.freeze({
  width: "", height: "",
  cropEnabled: false, cropWidth: "", cropHeight: "", cropX: "", cropY: "",
  rotate: "", flip: false, mirror: false, grayscale: false, sepia: false,
  outputEnabled: true, quality: 80, format: "webp",
});

export function createDefaultSettings(): TransformationSettings {
  return { ...DEFAULT_SETTINGS };
}

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
  const transformations: ImageTransformations = {};
  if (width !== undefined || height !== undefined) {
    transformations.resize = { ...(width !== undefined && { width }), ...(height !== undefined && { height }) };
  }

  if (settings.cropEnabled) {
    const cropWidth = dimension(settings.cropWidth, "Crop width");
    const cropHeight = dimension(settings.cropHeight, "Crop height");
    if (cropWidth === undefined || cropHeight === undefined) {
      throw new ImageInputError("Enter both crop width and crop height, or turn crop off.");
    }
    function offset(value: string, label: string): number | undefined {
      if (!value.trim()) return undefined;
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < 0) {
        throw new ImageInputError(`${label} must be a whole number from 0 to ${Number.MAX_SAFE_INTEGER}, or left empty for 0.`);
      }
      return number;
    }
    const x = offset(settings.cropX, "Crop X");
    const y = offset(settings.cropY, "Crop Y");
    transformations.crop = { width: cropWidth, height: cropHeight, ...(x !== undefined && { x }), ...(y !== undefined && { y }) };
  }

  if (settings.rotate.trim()) {
    const rotate = Number(settings.rotate);
    if (!Number.isFinite(rotate) || rotate < -360 || rotate > 360) {
      throw new ImageInputError("Rotation must be a number from −360 to 360 degrees, or left empty.");
    }
    if (rotate !== 0) transformations.rotate = rotate;
  }
  if (settings.flip) transformations.flip = true;
  if (settings.mirror) transformations.mirror = true;
  if (settings.grayscale || settings.sepia) {
    transformations.filters = { ...(settings.grayscale && { grayscale: true }), ...(settings.sepia && { sepia: true }) };
  }
  if (settings.outputEnabled) {
    if (!Number.isInteger(settings.quality) || settings.quality < 1 || settings.quality > 100) {
      throw new ImageInputError("Quality must be a whole number from 1 to 100.");
    }
    if (!isImageFormat(settings.format)) throw new ImageInputError("Choose WebP, JPEG, or PNG as the output format.");
    transformations.quality = settings.quality;
    transformations.format = settings.format;
  }
  if (Object.keys(transformations).length === 0) {
    throw new ImageInputError("Choose at least one transformation, or enable custom output to create a new version.");
  }
  return { transformations };
}

// Validate applied metadata before displaying it; historical records may omit it.
export function isImageTransformations(value: unknown): value is ImageTransformations {
  const object = (candidate: unknown): candidate is Record<string, unknown> => Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);
  const keysAllowed = (record: Record<string, unknown>, keys: string[]) => Object.keys(record).every((key) => keys.includes(key));
  const integer = (number: unknown, min: number, max: number) => typeof number === "number" && Number.isSafeInteger(number) && number >= min && number <= max;
  if (!object(value) || !keysAllowed(value, ["resize", "crop", "rotate", "flip", "mirror", "quality", "format", "filters"]) || Object.keys(value).length === 0) return false;
  const { resize, crop, rotate, filters, quality, format } = value;
  if (resize !== undefined && (!object(resize) || !keysAllowed(resize, ["width", "height"]) ||
    (resize.width === undefined && resize.height === undefined) ||
    (resize.width !== undefined && !integer(resize.width, 1, 4000)) ||
    (resize.height !== undefined && !integer(resize.height, 1, 4000)))) return false;
  if (crop !== undefined && (!object(crop) || !keysAllowed(crop, ["width", "height", "x", "y"]) ||
    !integer(crop.width, 1, 4000) || !integer(crop.height, 1, 4000) ||
    (crop.x !== undefined && !integer(crop.x, 0, Number.MAX_SAFE_INTEGER)) ||
    (crop.y !== undefined && !integer(crop.y, 0, Number.MAX_SAFE_INTEGER)))) return false;
  if (rotate !== undefined && (typeof rotate !== "number" || !Number.isFinite(rotate) || rotate < -360 || rotate > 360)) return false;
  if (value.flip !== undefined && typeof value.flip !== "boolean") return false;
  if (value.mirror !== undefined && typeof value.mirror !== "boolean") return false;
  if (quality !== undefined && !integer(quality, 1, 100)) return false;
  if (format !== undefined && !isImageFormat(format)) return false;
  if (filters !== undefined && (!object(filters) || !keysAllowed(filters, ["grayscale", "sepia"]) ||
    (filters.grayscale === undefined && filters.sepia === undefined) ||
    (filters.grayscale !== undefined && typeof filters.grayscale !== "boolean") ||
    (filters.sepia !== undefined && typeof filters.sepia !== "boolean"))) return false;
  return true;
}

export function appliedTransformationLabels(applied: ImageTransformations | undefined): string[] {
  if (!applied) return [];
  const labels: string[] = [];
  if (applied.crop) labels.push(`Crop ${applied.crop.width} × ${applied.crop.height} at (${applied.crop.x ?? 0}, ${applied.crop.y ?? 0})`);
  if (applied.resize) {
    const { width, height } = applied.resize;
    labels.push(width !== undefined && height !== undefined ? `Resize ${width} × ${height}` : `Resize ${width !== undefined ? `width ${width}` : `height ${height}`} px`);
  }
  if (applied.flip) labels.push("Flip vertically");
  if (applied.mirror) labels.push("Mirror horizontally");
  if (applied.rotate) labels.push(`Rotate ${applied.rotate}°`);
  if (applied.filters?.grayscale) labels.push("Grayscale");
  if (applied.filters?.sepia) labels.push("Sepia");
  return labels;
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
