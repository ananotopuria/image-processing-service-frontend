import { useEffect, useRef, useState } from "react";
import { refreshImageLinks } from "../api/images";
import { getImageErrorMessage } from "../api/imageErrors";
import type { ImageMetadata } from "../api/images.types";
import { isPresignedUrlExpired } from "../utils/imageHistory";
import { usableImageUrl } from "../utils/images";

export function useImageAccess(initialImage: ImageMetadata) {
  const [image, setImage] = useState(initialImage);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const expiry = image.urlExpiresAt ? Date.parse(image.urlExpiresAt) : NaN;
    const delay = expiry - Date.now() - 30000;
    if (!Number.isFinite(delay) || delay <= 0) return;
    // A single timer hides stale links; it does not poll or fetch anything.
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(delay, 2147483647));
    return () => window.clearTimeout(timer);
  }, [image.urlExpiresAt]);

  async function refresh(): Promise<ImageMetadata | null> {
    if (request.current) return null;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setError("");
    try {
      const next = await refreshImageLinks(image._id, controller.signal);
      if (controller.signal.aborted) return null;
      setImage(next);
      setPreviewFailed(false);
      setNow(Date.now());
      return next;
    } catch (error: unknown) {
      if (!controller.signal.aborted) setError(getImageErrorMessage(error, "load"));
      return null;
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }

  async function download() {
    if (request.current) return;
    const current = isPresignedUrlExpired(image.urlExpiresAt) || !usableImageUrl(image.downloadUrl) ? await refresh() : image;
    if (!current) return;
    const url = usableImageUrl(current.downloadUrl);
    if (!url || isPresignedUrlExpired(current.urlExpiresAt, Date.now(), 0)) {
      setError("A working download link is not available. Refresh the image links and try again.");
      return;
    }
    // S3's signed response sets Content-Disposition: attachment. Same-tab navigation
    // avoids popup blockers after an asynchronous refresh; no API token goes to S3.
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noreferrer";
    link.download = current.filename;
    document.body.append(link);
    link.click();
    link.remove();
  }

  return {
    image, refreshing, error, previewFailed,
    expired: isPresignedUrlExpired(image.urlExpiresAt, now),
    failPreview: () => setPreviewFailed(true),
    refresh, download,
  };
}
