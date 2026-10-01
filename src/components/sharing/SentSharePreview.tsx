import { useEffect, useState } from "react";
import axios from "axios";
import { getImageById } from "../../api/images";
import { getImageErrorMessage } from "../../api/imageErrors";
import type { ImageMetadata } from "../../api/images.types";
import { useImageAccess } from "../../hooks/useImageAccess";
import { usableImageUrl } from "../../utils/images";
import LoadingImage from "../images/LoadingImage";

// Mount only for a surviving image summary, keyed by the exact shared image ID.
// Keep the resolved metadata in memory for this card, as other History cards do.
export default function SentSharePreview({ imageId, filename }: { imageId: string; filename: string }) {
  const [result, setResult] = useState<{ image?: ImageMetadata; error?: string; unavailable?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    // Strict Mode's discarded setup must not start another request.
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      try {
        const image = await getImageById(imageId, controller.signal);
        if (!controller.signal.aborted) setResult({ image });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: getImageErrorMessage(error, "load"),
          unavailable: axios.isAxiosError(error) && [403, 404].includes(error.response?.status ?? 0) });
      }
    });
    return () => controller.abort();
  }, [imageId, attempt]);
  if (result?.image) return <ResolvedPreview image={result.image} filename={filename} />;
  if (!result) return <div role="status" className="image-skeleton flex h-full w-full items-center justify-center bg-specimen-paper p-5 text-xs text-muted-ink">Loading preview…</div>;
  return <div className="px-5 text-center text-xs text-muted-ink">
    <p>{result.unavailable ? "This image is unavailable or deleted." : "Preview could not be loaded."}</p>
    {!result.unavailable && <><p className="mt-2">{result.error}</p><button type="button" onClick={() => { setResult(null); setAttempt((value) => value + 1); }} className="min-h-11 cursor-pointer underline">Retry preview</button></>}
  </div>;
}

export function ResolvedPreview({ image: initialImage, filename }: { image: ImageMetadata; filename: string }) {
  const { image, expired, previewFailed, refreshing, error, failPreview, refresh } = useImageAccess(initialImage);
  const url = usableImageUrl(image.url);
  // No automatic retry loop: each explicit refresh makes at most one request.
  return url && !expired && !previewFailed && !error
    ? <LoadingImage src={url} alt={filename} loading="lazy" referrerPolicy="no-referrer" onError={failPreview}
      containerClassName="h-full w-full" className="h-full w-full object-contain p-3" />
    : <div className="px-5 text-center text-xs text-muted-ink">
      <p>{expired ? "This preview link has expired." : "Preview unavailable."}</p>
      {error && <p role="status" className="mt-2">{error}</p>}
      <button type="button" disabled={refreshing} onClick={() => { void refresh(); }} className="min-h-11 cursor-pointer underline disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh preview"}</button>
    </div>;
}
