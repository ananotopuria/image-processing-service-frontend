import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useSharedImageAccess } from "../../hooks/useSharedImageAccess";
import LoadingImage from "../images/LoadingImage";
import type { Share } from "../../api/sharing.types";
import { imageDate } from "../../utils/imageHistory";

export default function ReceivedShareCard({ shareId, share, available = true, revision, selected = false }: { shareId: string; share?: Share; available?: boolean; revision: number; selected?: boolean }) {
  const { image, share: accessedShare, loading, unavailable, error, expired, refresh, download } = useSharedImageAccess(shareId, available, revision);
  const metadata = accessedShare ?? (share?._id === shareId ? share : null);
  const sharedOn = imageDate(metadata?.createdAt);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (selected) heading.current?.focus(); }, [selected, shareId]);
  return <article className={`min-w-0 overflow-hidden rounded-sm border bg-paper ${selected ? "border-ink" : "border-archive-line"}`}>
    <div className="flex aspect-4/3 items-center justify-center bg-specimen-paper p-5">
      {image && !expired && !unavailable && image.url !== failedUrl ? <LoadingImage src={image.url} alt={image.filename} referrerPolicy="no-referrer" onError={() => setFailedUrl(image.url)} containerClassName="h-full w-full" className="h-full w-full object-contain" />
        : <p className="max-w-xs text-center text-sm text-muted-ink">{unavailable ? "This share is unavailable. It was revoked or the image was deleted." : loading ? "Loading shared image…" : expired ? "The image links have expired. Refresh to view this image." : "Preview unavailable. Refresh the image links to try again."}</p>}
    </div>
    <div className="p-5"><p className="font-mono text-[10px] text-muted-ink">{selected ? "SELECTED SHARE" : "SHARED WITH YOU"}</p>
      <h3 ref={heading} tabIndex={selected ? -1 : undefined} className="mt-3 wrap-anywhere font-editorial text-2xl">{image?.filename ?? "Shared image"}</h3>
      {image && <p className="mt-3 text-xs text-muted-ink">{image.format.toUpperCase()}{image.width && image.height ? ` · ${image.width} × ${image.height} px` : ""}</p>}
      {/* The verified API exposes senderId only. Do not infer an email or a
          deleted account from it; see the backend requirement in the docs. */}
      <p className="mt-3 wrap-anywhere text-xs leading-relaxed text-muted-ink">Shared by: Email unavailable</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-ink">{metadata && sharedOn
        ? <>Shared on: <time dateTime={metadata.createdAt}>{sharedOn}</time></>
        : loading ? "Loading share date…" : "Share date unavailable"}</p>
      {!unavailable && <div className="mt-4 flex flex-wrap gap-4"><button type="button" disabled={loading} onClick={() => { void download(); }} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm bg-ink px-4 text-sm text-paper disabled:opacity-50"><Download size={15} />Download</button>
        <button type="button" disabled={loading} onClick={() => { setFailedUrl(null); void refresh(); }} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm underline disabled:opacity-50"><RefreshCw size={14} />Refresh links</button></div>}
      {loading && <p role="status" className="mt-3 text-xs text-muted-ink">Getting temporary image links…</p>}
      {error && !unavailable && <p role="alert" className="mt-3 text-sm">{error}</p>}
    </div>
  </article>;
}
