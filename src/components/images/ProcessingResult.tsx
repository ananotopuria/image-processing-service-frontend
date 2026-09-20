import { useEffect, useRef, useState } from "react";
import { Check, Download, ExternalLink, RefreshCw } from "lucide-react";
import type { ImageMetadata } from "../../api/images.types";
import { appliedTransformationLabels, calculateSizeReduction, formatFileSize, usableImageUrl } from "../../utils/images";

interface ProcessingResultProps {
  image: ImageMetadata;
  refreshing: boolean;
  onRefresh: () => void;
  onReset: () => void;
}

export default function ProcessingResult({ image, refreshing, onRefresh, onReset }: ProcessingResultProps) {
  const expiresAt = image.urlExpiresAt ? Date.parse(image.urlExpiresAt) : NaN;
  const [expired, setExpired] = useState(() => Number.isFinite(expiresAt) && expiresAt <= Date.now());
  const [previewFailed, setPreviewFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const url = usableImageUrl(image.url);
  const downloadUrl = usableImageUrl(image.downloadUrl);
  const reduction = calculateSizeReduction(image.originalSize, image.processedSize);
  const appliedLabels = appliedTransformationLabels(image.transformations);

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    const timer = window.setTimeout(() => setExpired(true), Math.min(expiresAt - Date.now(), 2147483647));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  return (
    <section aria-labelledby="result-title" className="mt-10 border-t border-archive-line pt-8">
      <p className="flex items-center gap-2 font-mono text-[11px] text-muted-ink"><Check size={16} aria-hidden="true" /> TRANSFORMATION COMPLETE</p>
      <h2 id="result-title" ref={heading} tabIndex={-1} className="mt-3 font-editorial text-4xl">A new form, ready.</h2>
      <div className="mt-7 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex min-h-64 items-center justify-center border border-specimen-line bg-specimen-paper p-5 sm:min-h-80">
          {url && !expired && !previewFailed ? (
            <img src={url} alt={`Processed ${image.originalName}`} referrerPolicy="no-referrer" onError={() => setPreviewFailed(true)} className="max-h-112 max-w-full object-contain" />
          ) : <p className="max-w-sm text-center text-sm leading-relaxed text-muted-ink">{expired ? "The preview link has expired. Refresh the links to view your image again." : "Your image was processed, but its preview is unavailable. Refresh the links to try again."}</p>}
        </div>
        <div className="min-w-0">
          <p className="wrap-anywhere text-sm font-semibold">{image.originalName}</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-6 border-y border-archive-line py-6 text-sm">
            {[
              ["FORMAT", image.format.toUpperCase()],
              ["DIMENSIONS", image.width && image.height ? `${image.width} × ${image.height} px` : "Unavailable"],
              ...(image.quality === undefined ? [] : [["QUALITY", String(image.quality)]]),
              ["ORIGINAL", formatFileSize(image.originalSize)],
              ["PROCESSED", image.processedSize === undefined ? "Unavailable" : formatFileSize(image.processedSize)],
              ...(reduction === null ? [] : [[reduction < 0 ? "SIZE INCREASE" : "SIZE SAVED", `${Math.abs(reduction).toFixed(1)}%`]]),
            ].map(([label, value]) => <div key={label}><dt className="font-mono text-[10px] text-muted-ink">{label}</dt><dd className="mt-2">{value}</dd></div>)}
          </dl>
          {appliedLabels.length > 0 && <div className="mt-5">
            <h3 className="font-mono text-[10px] text-muted-ink">APPLIED TRANSFORMATIONS</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {appliedLabels.map((label) => <li key={label} className="rounded-sm border border-specimen-line bg-specimen-paper px-3 py-2 text-xs">{label}</li>)}
            </ul>
          </div>}
          <div className="mt-6 flex flex-wrap gap-4">
            {downloadUrl && !expired && <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-3 rounded-sm bg-ink px-5 py-3 text-sm text-paper hover:bg-ink-hover"><Download size={16} aria-hidden="true" /> Download image<span className="sr-only"> (opens in a new tab)</span></a>}
            {url && !expired && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 text-sm underline">View image <ExternalLink size={15} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-ink">Image links are temporary and last up to 15 minutes. Refresh them here if access expires.</p>
          <button type="button" onClick={onRefresh} disabled={refreshing} className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm underline disabled:cursor-wait disabled:opacity-50"><RefreshCw size={14} aria-hidden="true" className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} />{refreshing ? "Refreshing links…" : "Refresh image links"}</button>
        </div>
      </div>
      <button type="button" onClick={onReset} disabled={refreshing} className="mt-8 inline-flex min-h-12 cursor-pointer items-center rounded-sm border border-ink px-5 text-sm hover:bg-specimen-paper disabled:cursor-not-allowed disabled:opacity-50">Process another image</button>
    </section>
  );
}
