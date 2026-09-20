export type ImageFormat = "jpeg" | "png" | "webp";

export interface TransformationSettings {
  width: string;
  height: string;
  quality: number;
  format: ImageFormat;
}

// This page uses the resize/encoding subset of the backend's transformation DTO.
export interface TransformImageRequest {
  transformations: {
    resize?: { width?: number; height?: number };
    quality: number;
    format: ImageFormat;
  };
}

// Metadata consumed by this page, from ImageResponseDto (not a response envelope).
export interface ImageMetadata {
  _id: string;
  kind: "original" | "transformed";
  originalImageId?: string;
  originalName: string;
  filename: string;
  path: string;
  format: ImageFormat;
  originalSize: number;
  width?: number;
  height?: number;
  quality?: number;
  processedSize?: number;
  // The backend supplies these; tolerate missing links so metadata remains usable.
  url?: string;
  downloadUrl?: string;
  urlExpiresAt?: string;
}
