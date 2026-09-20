export type ImageFormat = "jpeg" | "png" | "webp";

export interface TransformationSettings {
  width: string;
  height: string;
  cropEnabled: boolean;
  cropWidth: string;
  cropHeight: string;
  cropX: string;
  cropY: string;
  rotate: string;
  flip: boolean;
  mirror: boolean;
  grayscale: boolean;
  sepia: boolean;
  outputEnabled: boolean;
  quality: number;
  format: ImageFormat;
}

// Matches the backend DTO. Crop offsets are optional and default to zero.
export interface ImageTransformations {
  resize?: { width?: number; height?: number };
  crop?: { width: number; height: number; x?: number; y?: number };
  rotate?: number;
  flip?: boolean;
  mirror?: boolean;
  quality?: number;
  format?: ImageFormat;
  filters?: { grayscale?: boolean; sepia?: boolean };
}

export interface TransformImageRequest {
  transformations: ImageTransformations;
}

// Metadata consumed by this page, from ImageResponseDto (not a response envelope).
export interface ImageMetadata {
  _id: string;
  // Legacy records predate original preservation and have no kind.
  kind?: "original" | "transformed";
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
  transformations?: ImageTransformations;
  createdAt?: string;
  updatedAt?: string;
  // The backend supplies these; tolerate missing links so metadata remains usable.
  url?: string;
  downloadUrl?: string;
  urlExpiresAt?: string;
}

export interface PaginatedImagesResponse {
  items: ImageMetadata[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
