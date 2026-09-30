import { RefreshCw } from "lucide-react";
import type { ImageMetadata } from "../../api/images.types";
import type { EditorImage } from "./ImagePreview";
import LoadingImage from "./LoadingImage";
import { formatFileSize } from "../../utils/images";

export default function SavedOriginalPreview({ original, preview, loading, previewLoading, error, previewError, disabled, onRetry }: {
  original: ImageMetadata | null; preview: EditorImage | null; loading: boolean; previewLoading: boolean;
  error: string; previewError: string; disabled: boolean; onRetry: () => void;
}) {
  return <div className="overflow-hidden rounded-sm border border-archive-line bg-specimen-paper" aria-busy={loading || previewLoading}>
    <div className="h-64 sm:h-96">
      {loading || previewLoading ? <div role="status" className="image-skeleton flex h-full items-center justify-center p-6 text-sm text-muted-ink">{loading ? "Loading saved original…" : "Preparing original preview…"}</div>
        : preview ? <LoadingImage src={preview.url} alt={`Saved original: ${original?.originalName}`} width={preview.width} height={preview.height} containerClassName="flex h-full items-center justify-center p-4" className="max-h-full max-w-full object-contain" />
        : <p role={error ? "alert" : "status"} className="flex h-full items-center justify-center p-6 text-sm leading-relaxed">{error || previewError || "Original preview unavailable."}</p>}
    </div>
    <div className="min-h-44 border-t border-archive-line p-5">
      <p className="font-mono text-[11px] text-muted-ink">SAVED ORIGINAL</p>
      {original && <>
        <p className="mt-2 wrap-anywhere text-sm font-semibold">{original.originalName}</p>
        <p className="mt-3 text-xs text-muted-ink">{original.format.toUpperCase()} · {formatFileSize(original.originalSize)}{preview ? ` · ${preview.width} × ${preview.height} px` : ""}</p>
      </>}
      <button type="button" onClick={onRetry} disabled={disabled || loading || previewLoading} className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm underline disabled:opacity-50"><RefreshCw size={14} aria-hidden="true" />{error ? "Retry loading original" : "Refresh preview"}</button>
    </div>
  </div>;
}
