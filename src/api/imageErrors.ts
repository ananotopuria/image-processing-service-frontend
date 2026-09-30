import axios from "axios";
import { ImageInputError } from "../utils/images";

export function getImageErrorMessage(error: unknown, operation: "process" | "load" | "delete" | "favorite" = "process"): string {
  if (error instanceof ImageInputError) return error.message;
  if (!axios.isAxiosError(error)) return operation === "process" ? "We could not process this image. Please try again." : "We could not complete this image request. Please try again.";
  if (import.meta.env.DEV) {
    // Never log request headers, tokens, file bytes, or signed S3 URLs.
    console.debug("Image request failed", { status: error.response?.status, code: error.code });
  }
  if (operation === "favorite") {
    if (error.response?.status === 401) return "Your session has expired. Please sign in again.";
    if (error.response?.status === 404) return "This image is no longer available to your account. Refresh the gallery.";
    if (error.response?.status !== 429) return "Could not update this favorite. The change was undone. Refresh to check its saved state, or try again.";
  }
  if (error.response?.status === 429) {
    const seconds = Math.max(1, Math.ceil(((getRetryAfterDeadline(error) ?? Date.now() + 60000) - Date.now()) / 1000));
    return `Too many image requests. Try again in ${seconds} seconds.`;
  }
  if (!error.response) {
    const timedOut = error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";
    if (operation !== "process") return operation === "delete"
      ? "Deletion could not be confirmed. Check your connection and refresh the gallery before retrying; the image may already have been deleted."
      : timedOut ? "The image service took too long to respond. Please retry loading your images."
      : "Could not load images. Check your connection and try again. A network or CORS issue may prevent access.";
    return timedOut
      ? "The image service took too long to respond. Your image may have been saved; retrying can create another version."
      : "Could not reach the image service. Check your connection. A network or CORS issue may prevent access; an interrupted request may still have saved your image.";
  }
  const status = error.response.status;
  if (operation !== "process") {
    if (status === 404) return "This image is no longer available. Refresh the gallery to see the latest records.";
    if (status === 400) return "The image request was not accepted. Refresh the gallery and try again.";
    if (status === 429) return "Too many image requests. Wait a minute before trying again.";
    if (status >= 500) return operation === "delete"
      ? "Deletion could not finish. Some files may have been removed. Refresh the gallery before retrying."
      : "Image history or storage is unavailable right now. Please try again later.";
  }
  const data: unknown = error.response.data;
  const message = data && typeof data === "object" && "message" in data ? data.message : undefined;
  // Only this exact backend-authored crop error may supply dimensions to the UI.
  const cropBounds = status === 400 && typeof message === "string"
    ? /^Crop rectangle must fit within the original image \((\d{1,9}) x (\d{1,9}) pixels\)$/.exec(message)
    : null;
  if (cropBounds) return `The crop must fit within the original image (${cropBounds[1]} × ${cropBounds[2]} pixels). Reduce the crop size or its X/Y offsets; resize settings do not change these bounds.`;
  const messages: Record<number, string> = {
    400: "Check your image and settings. Use dimensions from 1–4000, rotation from −360 to 360°, and quality from 1–100. A crop must fit inside the original image.",
    401: "Your session has expired. Please sign in again.",
    404: "This image is no longer available to your account. Choose the original file again.",
    409: "The saved original is unavailable. Choose the original file again.",
    413: "Choose an image smaller than 5 MiB (5,242,880 bytes).",
    422: "The original image could not be decoded. It may be damaged. Choose another image.",
    429: "Too many image requests. Wait a minute before trying again.",
    500: "The image service could not save the result. Please try again later.",
    502: "Image storage is unavailable. Your image may already be saved; retrying can create another copy.",
  };
  // Fixed messages map verified backend errors without exposing arbitrary internals.
  return messages[status] ?? "The image service is unavailable right now. Please try again later.";
}

// Retry-After may be delta-seconds or an HTTP date. No automatic mutation retries.
export function getRetryAfterDeadline(error: unknown, now = Date.now()): number | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 429) return null;
  const raw = Object.entries(error.response.headers).find(([name]) => name.toLowerCase() === "retry-after")?.[1];
  const value = typeof raw === "number" || typeof raw === "string" ? String(raw).trim() : "";
  if (/^\d+(\.\d+)?$/.test(value)) return now + Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(now, date) : now + 60000;
}
