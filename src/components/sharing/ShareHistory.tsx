import { useEffect, useRef, useState } from "react";
import { isSharingId, revokeShare, sharingError } from "../../api/sharing";
import type { SentShare } from "../../api/sharing.types";
import { sharingState } from "../../sharing/state";
import { useSharing } from "../../sharing/useSharing";
import GalleryLoading from "../images/GalleryLoading";
import ReceivedShareCard from "./ReceivedShareCard";
import InfiniteImageLoader from "../images/InfiniteImageLoader";
import SentSharePreview from "./SentSharePreview";

function SentShareCard({ share }: { share: SentShare }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [revoked, setRevoked] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function revoke() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller; setPending(true); setError("");
    try { await revokeShare(share._id, controller.signal); if (!controller.signal.aborted) { setRevoked(true); void sharingState.sent.refresh(); } }
    catch (error) { if (!controller.signal.aborted) setError(sharingError(error)); }
    finally { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setPending(false); }
  }
  return <article className="min-w-0 overflow-hidden rounded-sm border border-archive-line bg-paper">
    <div className="flex h-56 items-center justify-center overflow-hidden border-b border-archive-line bg-specimen-paper sm:h-64">
      {share.image ? <SentSharePreview key={share.imageId} imageId={share.imageId} filename={share.image.filename} />
        : <p className="px-5 text-center text-xs text-muted-ink">This image is unavailable or deleted.</p>}
    </div>
    <div className="p-5">
    <p className="font-mono text-[10px] text-muted-ink">SENT SHARE</p>
    <h3 className="mt-3 wrap-anywhere font-editorial text-2xl">{share.image?.filename ?? "Image unavailable"}</h3>
    <p className="mt-3 wrap-anywhere text-sm">Recipient: {share.recipientEmail ?? "Account deleted"}</p>
    <p className="mt-3 text-xs text-muted-ink">{revoked || share.revokedAt ? "Revoked" : !share.available ? "Image unavailable or deleted" : share.recipientEmail === null ? "Recipient unavailable" : "Available to recipient"}</p>
    {!revoked && !share.revokedAt && <button type="button" disabled={pending} onClick={() => { void revoke(); }} className="mt-4 min-h-11 cursor-pointer text-sm underline disabled:opacity-50">{pending ? "Revoking…" : "Revoke share"}</button>}
    {revoked && <p role="status" className="mt-3 text-xs">Share revoked. Previously issued download links may work until they expire.</p>}
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    </div>
  </article>;
}
export default function ShareHistory({ view, selectedShareId }: { view: "received" | "sent"; selectedShareId: string | null }) {
  const state = useSharing(); const collection = state[view];
  useEffect(() => { sharingState[view].activate(); return () => sharingState[view].deactivate(); }, [view]);
  const selected = view === "received" && selectedShareId && isSharingId(selectedShareId) ? selectedShareId : null;
  return <div className="mt-7">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-y border-archive-line py-3"><p className="text-sm text-muted-ink">{collection.data ? `Showing ${collection.data.items.length} of ${collection.data.total} ${view} ${collection.data.total === 1 ? "share" : "shares"}` : "Your shared images"}</p>
      <button type="button" disabled={collection.loading} onClick={() => { void sharingState[view].refresh(); }} className="min-h-11 cursor-pointer text-sm underline disabled:opacity-50">Refresh shares</button></div>
    {selectedShareId && view === "received" && !selected && <p role="alert" className="mb-5 text-sm">This sharing link is invalid.</p>}
    {selected && <div className="mb-7 max-w-xl"><ReceivedShareCard key={selected} shareId={selected} share={state.received.data?.items.find((share) => share._id === selected)} revision={state.accessRevision} selected /></div>}
    {collection.error && !collection.data && <div role="alert" className="mb-5 border-l-2 border-ink bg-specimen-paper p-4 text-sm"><p>{collection.error}</p><button type="button" disabled={collection.loading} onClick={() => { void sharingState[view].retry(); }} className="min-h-11 cursor-pointer underline">Retry</button></div>}
    {collection.loading && !collection.data && <GalleryLoading />}
    {collection.data?.items.length === 0 && !collection.loading && <p role="status" className="border border-dashed border-specimen-line bg-specimen-paper p-10 text-center text-sm text-muted-ink">{collection.data.total === 0 ? view === "received" ? "No images have been shared with you yet." : "You haven’t shared any images yet." : "No shares available. Refresh to check for updates."}</p>}
    <div className="grid items-start gap-6 md:grid-cols-2">{view === "received"
      ? state.received.data?.items.filter((share) => share._id !== selected).map((share) => <ReceivedShareCard key={share._id} shareId={share._id} share={share} available={share.available} revision={state.accessRevision} />)
      : state.sent.data?.items.map((share) => <SentShareCard key={share._id} share={share} />)}</div>
    {collection.data && collection.data.total > 0 && <InfiniteImageLoader noun="shares" hasMore={collection.hasMore} loading={collection.loading} error={collection.error} disabled={false} onLoadMore={sharingState[view].loadMore} onRetry={sharingState[view].retry} />}
  </div>;
}
