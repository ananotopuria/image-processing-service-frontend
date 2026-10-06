import type { ImageFormat } from "./images.types";
export interface Share {
  _id: string; senderId: string; recipientId: string; imageId: string;
  revokedAt: string | null; createdAt: string; updatedAt: string; available: boolean;
}
export interface ReceivedShare extends Share {
  senderEmail: string | null;
}
export interface SentShare extends Share {
  recipientEmail: string | null;
  image: { filename: string; format: ImageFormat } | null;
}
export interface SharedImage {
  _id: string; filename: string; format: ImageFormat; kind?: "original" | "transformed";
  mimeType?: string; width?: number; height?: number;
  url: string; downloadUrl: string; urlExpiresAt: string;
}
export interface SharedAccess { share: Share; image: SharedImage }
export interface ShareNotification {
  _id: string; type: "image.shared"; shareId: string; readAt: string | null;
  createdAt: string; updatedAt: string; available: boolean;
}
export interface SharingPage<T> { items: T[]; page: number; limit: number; total: number; totalPages: number }
