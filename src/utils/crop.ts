import type { PercentCrop } from "react-image-crop";
import type { TransformationSettings } from "../api/images.types";

export interface ImageDimensions { width: number; height: number }
export interface CropRectangle extends ImageDimensions { x: number; y: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Percentages refer to the displayed original, never resized/rotated output.
export function percentCropToPixels(crop: PercentCrop, image: ImageDimensions): CropRectangle | undefined {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width <= 0 || crop.height <= 0) return;
  const x = clamp(Math.round(crop.x * image.width / 100), 0, image.width - 1);
  const y = clamp(Math.round(crop.y * image.height / 100), 0, image.height - 1);
  const right = clamp(Math.round((crop.x + crop.width) * image.width / 100), x + 1, image.width);
  const bottom = clamp(Math.round((crop.y + crop.height) * image.height / 100), y + 1, image.height);
  return { x, y, width: Math.min(4000, right - x), height: Math.min(4000, bottom - y) };
}

export function pixelsToPercentCrop(crop: CropRectangle, image: ImageDimensions): PercentCrop {
  return { unit: "%", x: crop.x / image.width * 100, y: crop.y / image.height * 100,
    width: crop.width / image.width * 100, height: crop.height / image.height * 100 };
}

export function initialCrop(image: ImageDimensions): CropRectangle {
  const width = Math.max(1, Math.min(4000, Math.round(image.width * 0.8)));
  const height = Math.max(1, Math.min(4000, Math.round(image.height * 0.8)));
  return { width, height, x: Math.floor((image.width - width) / 2), y: Math.floor((image.height - height) / 2) };
}

export function cropFields(crop: CropRectangle | undefined) {
  return { cropWidth: crop ? String(crop.width) : "", cropHeight: crop ? String(crop.height) : "",
    cropX: crop ? String(crop.x) : "", cropY: crop ? String(crop.y) : "" };
}

export function settingsCrop(settings: TransformationSettings, image: ImageDimensions): CropRectangle | undefined {
  const crop = { width: Number(settings.cropWidth), height: Number(settings.cropHeight),
    x: Number(settings.cropX), y: Number(settings.cropY) };
  if (!Object.values(crop).every(Number.isSafeInteger) || crop.width < 1 || crop.height < 1 ||
    crop.width > 4000 || crop.height > 4000 || crop.x < 0 || crop.y < 0 ||
    crop.x + crop.width > image.width || crop.y + crop.height > image.height) return;
  return crop;
}

// A replacement file must never inherit coordinates from the previous original.
export function resetCropForImage(settings: TransformationSettings, image?: ImageDimensions): TransformationSettings {
  return { ...settings, cropEnabled: Boolean(image && settings.cropEnabled),
    ...cropFields(image && settings.cropEnabled ? initialCrop(image) : undefined) };
}
