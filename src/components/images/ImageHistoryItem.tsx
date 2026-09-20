import { Download, ImageOff, RefreshCw, Trash2 } from "lucide-react";
import type { ImageMetadata } from "../../api/images.types";
import { useImageAccess } from "../../hooks/useImageAccess";
import { imageDate, imageKindLabel } from "../../utils/imageHistory";
import { appliedTransformationLabels, calculateSizeReduction, formatFileSize, usableImageUrl } from "../../utils/images";

interface ImageHistoryItemProps {
  image: ImageMetadata;
  compact?: boolean;
  deleteDisabled?: boolean;
  onDelete?: (image: ImageMetadata) => void;
}

export default function ImageHistoryItem({ image: initialImage, compact = false, deleteDisabled, onDelete }: ImageHistoryItemProps) {
  const { image, refreshing, error, previewFailed, expired, failPreview, refresh, download } = useImageAccess(initialImage);
  const url = usableImageUrl(image.url);
  const created = imageDate(image.createdAt);
  const expiry = imageDate(image.urlExpiresAt);
  const transformations = appliedTransformationLabels(image.transformations);
  const savings = calculateSizeReduction(image.originalSize, image.processedSize);
  const size = image.kind === "original" ? image.originalSize : image.processedSize;
  const canPreview = url && !expired && !previewFailed;

  return (
    <div className="min-w-0">
      <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden border-b border-archive-line bg-specimen-paper">
        {canPreview ? <img src={url} alt={`${imageKindLabel(image)}: ${image.originalName}`} loading="lazy" referrerPolicy="no-referrer" onError={failPreview} className="h-full w-full object-contain p-3" /> : (
          <div className="flex max-w-xs flex-col items-center gap-3 px-5 py-4 text-center text-xs leading-relaxed text-muted-ink">
            <ImageOff size={24} strokeWidth={1} aria-hidden="true" />
            <p>{expired ? "Refresh this temporary link to see the preview." : "The preview could not be displayed."}</p>
            <button type="button" disabled={refreshing} onClick={() => { void refresh(); }} className="min-h-11 cursor-pointer px-3 underline disabled:cursor-wait disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh preview"}</button>
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-sm border border-archive-line bg-paper px-2.5 py-1 font-mono text-[10px]">{imageKindLabel(image)}</span>
      </div>
      <div className="p-5">
        <h3 className="wrap-anywhere font-editorial text-2xl leading-tight">{image.originalName}</h3>
        <p className="mt-3 text-xs leading-relaxed text-muted-ink">
          {image.format.toUpperCase()}
          {image.width && image.height ? ` · ${image.width} × ${image.height} px` : ""}
          {size !== undefined ? ` · ${formatFileSize(size)}` : ""}
          {image.quality !== undefined ? ` · Quality ${image.quality}` : ""}
        </p>
        {created && <p className="mt-2 text-xs text-muted-ink"><time dateTime={image.createdAt}>{created}</time></p>}
        {image.kind === undefined && <p className="mt-3 text-xs leading-relaxed text-muted-ink">Saved before original/version tracking. Its relationship to other files is unavailable.</p>}

        {!compact && (
          <>
            <details className="mt-4 border-t border-archive-line">
              <summary className="min-h-11 cursor-pointer py-3 text-sm underline underline-offset-4">Image details</summary>
              <dl className="grid grid-cols-2 gap-4 py-3 text-xs">
                {image.width !== undefined && <div><dt className="text-muted-ink">Width</dt><dd className="mt-1">{image.width} px</dd></div>}
                {image.height !== undefined && <div><dt className="text-muted-ink">Height</dt><dd className="mt-1">{image.height} px</dd></div>}
                <div><dt className="text-muted-ink">Original size</dt><dd className="mt-1">{formatFileSize(image.originalSize)}</dd></div>
                {image.processedSize !== undefined && <div><dt className="text-muted-ink">Processed size</dt><dd className="mt-1">{formatFileSize(image.processedSize)}</dd></div>}
                {savings !== null && <div><dt className="text-muted-ink">{savings < 0 ? "Size increase" : "Size saved"}</dt><dd className="mt-1">{Math.abs(savings).toFixed(1)}%</dd></div>}
                {expiry && <div className="col-span-2"><dt className="text-muted-ink">Access links expire</dt><dd className="mt-1"><time dateTime={image.urlExpiresAt}>{expiry}</time></dd></div>}
              </dl>
              {transformations.length > 0 && <ul aria-label="Applied transformations" className="mb-4 flex flex-wrap gap-2">
                {transformations.map((label) => <li key={label} className="rounded-sm border border-specimen-line bg-specimen-paper px-2 py-1 text-xs">{label}</li>)}
              </ul>}
              {image.kind === "transformed" && !image.transformations && <p className="mb-4 text-xs text-muted-ink">Applied transformation details were not saved for this version.</p>}
            </details>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" disabled={refreshing} onClick={() => { void download(); }} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm bg-ink px-4 py-2 text-xs text-paper hover:bg-ink-hover disabled:cursor-wait disabled:opacity-50"><Download size={14} aria-hidden="true" />{refreshing ? "Getting links…" : "Download"}</button>
              <button type="button" disabled={refreshing} onClick={() => { void refresh(); }} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs underline disabled:cursor-wait disabled:opacity-50"><RefreshCw size={13} aria-hidden="true" />Refresh links</button>
              {onDelete && <button type="button" disabled={deleteDisabled} onClick={() => onDelete(image)} aria-label={`Delete ${imageKindLabel(image).toLowerCase()}: ${image.originalName}`} className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs underline disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={14} aria-hidden="true" />Delete</button>}
            </div>
          </>
        )}
        <div role="status" aria-atomic="true">{refreshing && <p className="mt-3 text-xs text-muted-ink">Refreshing temporary image links…</p>}</div>
        <div role="alert">{error && <p className="mt-3 border-l-2 border-ink pl-3 text-xs leading-relaxed">{error}</p>}</div>
      </div>
    </div>
  );
}
