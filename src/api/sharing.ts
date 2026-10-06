import axios from "axios";
import { apiClient } from "./client";
import { tokenStorage } from "../auth/tokenStorage";
import { getRetryAfterDeadline } from "./imageErrors";
import { ImageInputError, isImageFormat, usableImageUrl } from "../utils/images";
import type { Share, ReceivedShare, SentShare, SharedAccess, ShareNotification, SharingPage } from "./sharing.types";

export const isSharingId = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new ImageInputError("The server returned incomplete sharing details. Refresh and try again.");
  return value as Record<string, unknown>;
}
function requireValid(valid: boolean) { if (!valid) throw new ImageInputError("The server returned incomplete sharing details. Refresh and try again."); }
export function readShare(value: unknown): Share {
  const item = record(value);
  requireValid([item._id, item.senderId, item.recipientId, item.imageId].every(isSharingId) &&
    (item.revokedAt === null || date(item.revokedAt)) && date(item.createdAt) && date(item.updatedAt) && typeof item.available === "boolean");
  return item as unknown as Share;
}
export function readReceivedShare(value: unknown): ReceivedShare {
  const share = readShare(value);
  const item = record(value);
  requireValid(item.senderEmail === null || (typeof item.senderEmail === "string" && item.senderEmail.trim().length > 0));
  return { ...share, senderEmail: item.senderEmail } as ReceivedShare;
}
export function readSentShare(value: unknown): SentShare {
  const share = readShare(value);
  const item = record(value);
  // Missing fields mean an incompatible response; explicit null means a deleted
  // related record. Never replace missing server data with share-form labels.
  requireValid(item.recipientEmail === null || (typeof item.recipientEmail === "string" && item.recipientEmail.trim().length > 0));
  if (item.image !== null) {
    const image = record(item.image);
    requireValid(typeof image.filename === "string" && image.filename.trim().length > 0 && isImageFormat(image.format));
  }
  return { ...share, recipientEmail: item.recipientEmail, image: item.image } as SentShare;
}
export function readNotification(value: unknown): ShareNotification {
  const item = record(value);
  requireValid(isSharingId(item._id) && isSharingId(item.shareId) && item.type === "image.shared" &&
    (item.readAt === null || date(item.readAt)) && date(item.createdAt) && date(item.updatedAt) && typeof item.available === "boolean");
  return item as unknown as ShareNotification;
}
function readPage<T extends { _id: string }>(value: unknown, page: number, limit: number, read: (item: unknown) => T): SharingPage<T> {
  const data = record(value);
  requireValid(Array.isArray(data.items) && data.items.length <= limit && data.page === page && data.limit === limit &&
    Number.isSafeInteger(data.total) && Number(data.total) >= 0 && data.totalPages === Math.ceil(Number(data.total) / limit));
  const items = (data.items as unknown[]).map(read);
  requireValid(new Set(items.map((item) => item._id)).size === items.length);
  return { items, page, limit, total: Number(data.total), totalPages: Number(data.totalPages) };
}
const deadlines = new Map<string, number>();
let sessionRevision = 0;
tokenStorage.subscribe(() => { sessionRevision++; deadlines.clear(); });
async function request<T>(route: string, send: () => Promise<T>): Promise<T> {
  const token = tokenStorage.getToken();
  const revision = sessionRevision;
  const deadline = deadlines.get(route) ?? 0;
  if (deadline > Date.now()) throw new ImageInputError(`Too many requests. Try again in ${Math.ceil((deadline - Date.now()) / 1000)} seconds.`);
  try {
    const result = await send();
    if (revision !== sessionRevision) throw new DOMException("Session changed", "AbortError");
    return result;
  }
  catch (error) {
    const retryAt = getRetryAfterDeadline(error);
    if (retryAt && revision === sessionRevision && token === tokenStorage.getToken()) deadlines.set(route, retryAt);
    throw error;
  }
}
function id(value: string) { if (!isSharingId(value)) throw new ImageInputError("This sharing link is invalid."); return value; }
async function list<T extends { _id: string }>(path: string, page: number, limit: number, signal: AbortSignal, read: (item: unknown) => T) {
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new ImageInputError("Choose a valid page and page size.");
  return request(path, async () => readPage((await apiClient.get<unknown>(path, { params: { page, limit }, signal })).data, page, limit, read));
}
export const getReceivedShares = (page: number, limit: number, signal: AbortSignal) => list("/api/shares/received", page, limit, signal, readReceivedShare);
export const getSentShares = (page: number, limit: number, signal: AbortSignal) => list("/api/shares/sent", page, limit, signal, readSentShare);
export const getNotifications = (page: number, limit: number, signal: AbortSignal) => list("/api/notifications", page, limit, signal, readNotification);
export async function getUnreadCount(signal: AbortSignal) {
  return request("/api/notifications/unread-count", async () => {
    const value = record((await apiClient.get<unknown>("/api/notifications/unread-count", { signal })).data);
    requireValid(Number.isSafeInteger(value.unreadCount) && Number(value.unreadCount) >= 0);
    return Number(value.unreadCount);
  });
}
export async function createShare(imageId: string, recipientEmail: string, signal: AbortSignal) {
  const body = { imageId: id(imageId), recipientEmail: recipientEmail.trim().toLowerCase() };
  return request("POST /api/shares", async () => {
    const share = readShare((await apiClient.post<unknown>("/api/shares", body, { signal })).data);
    requireValid(share.imageId === imageId && share.revokedAt === null && share.available);
    return share;
  });
}
export async function revokeShare(shareId: string, signal: AbortSignal) {
  const path = `/api/shares/${id(shareId)}`;
  return request("DELETE /api/shares/:id", async () => {
    const share = readShare((await apiClient.delete<unknown>(path, { signal })).data);
    requireValid(share._id === shareId && share.revokedAt !== null && !share.available);
    return share;
  });
}
export async function markNotificationRead(notificationId: string, signal: AbortSignal) {
  const path = `/api/notifications/${id(notificationId)}/read`;
  return request("PUT /api/notifications/:id/read", async () => {
    const item = readNotification((await apiClient.put<unknown>(path, undefined, { signal })).data);
    requireValid(item._id === notificationId && item.readAt !== null);
    return item;
  });
}
export async function getSharedAccess(shareId: string, signal: AbortSignal): Promise<SharedAccess> {
  const path = `/api/shares/${id(shareId)}`;
  return request("GET /api/shares/:id", async () => {
    const data = record((await apiClient.get<unknown>(path, { signal })).data);
    const share = readShare(data.share);
    const image = record(data.image);
    requireValid(share._id === shareId && share.available && share.revokedAt === null && image._id === share.imageId &&
      typeof image.filename === "string" && isImageFormat(image.format) &&
      (image.kind === undefined || image.kind === "original" || image.kind === "transformed") &&
      Boolean(usableImageUrl(typeof image.url === "string" ? image.url : undefined)) &&
      Boolean(usableImageUrl(typeof image.downloadUrl === "string" ? image.downloadUrl : undefined)) && date(image.urlExpiresAt));
    for (const dimension of [image.width, image.height]) requireValid(dimension === undefined || (Number.isSafeInteger(dimension) && Number(dimension) > 0));
    return { share, image: image as unknown as SharedAccess["image"] };
  });
}
export function sharingError(error: unknown): string {
  if (error instanceof ImageInputError) return error.message;
  if (!axios.isAxiosError(error)) return "Sharing is unavailable. Please try again.";
  const status = error.response?.status;
  const message = error.response?.data?.message;
  if (status === 400) return message === "Cannot share an image with yourself" ? "You cannot share an image with yourself." : "Enter a valid recipient email address.";
  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 404) return message === "Recipient not found" ? "No registered account uses that email address." : "This image or share is no longer available.";
  if (status === 409 && message === "An active share already exists for this image and recipient") return "This image is already shared with this recipient.";
  if (status === 429) return `Too many requests. Try again in ${Math.max(1, Math.ceil(((getRetryAfterDeadline(error) ?? Date.now() + 60000) - Date.now()) / 1000))} seconds.`;
  if (status === 502) return "Temporary image links are unavailable. Please retry.";
  return "Could not complete the request. Check your connection and retry. If you were sharing, check Sent shares before trying again.";
}
export const sharedHistoryUrl = (shareId: string) => `/images?view=received&shareId=${id(shareId)}`;
