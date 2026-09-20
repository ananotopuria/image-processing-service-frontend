import axios from "axios";
import { ImageInputError } from "../utils/images";

export function getImageErrorMessage(error: unknown): string {
  if (error instanceof ImageInputError) return error.message;
  if (!axios.isAxiosError(error)) return "We could not process this image. Please try again.";
  if (import.meta.env.DEV) {
    // Never log request headers, tokens, file bytes, or signed S3 URLs.
    console.debug("Image request failed", { status: error.response?.status, code: error.code });
  }
  if (!error.response) {
    return error.code === "ECONNABORTED" || error.code === "ETIMEDOUT"
      ? "Processing took too long to respond. Your image may have been saved; retrying can create another version."
      : "Could not reach the image service. Check your connection. A network or CORS issue may prevent access; an interrupted request may still have saved your image.";
  }
  const status = error.response.status;
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
