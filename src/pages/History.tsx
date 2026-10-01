import ShareHistory from "../components/sharing/ShareHistory";
import ShareImageDialog from "../components/sharing/ShareImageDialog";
import InfiniteImageLoader from "../components/images/InfiniteImageLoader";
import { useRestoreReprocessingScroll } from "../hooks/useReprocessingScroll";
import { tokenStorage } from "../auth/tokenStorage";
import { useFavoriteImages } from "../hooks/useFavoriteImages";
import { useFavorites } from "../hooks/useFavorites";
import ImageHistoryItem from "../components/images/ImageHistoryItem";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { deleteImage } from "../api/images";
import type { ImageMetadata } from "../api/images.types";
import { getImageErrorMessage } from "../api/imageErrors";
import { useGroupedImageHistory } from "../hooks/useGroupedImageHistory";
import ImageGroupCard from "../components/images/ImageGroupCard";
import DeleteImageDialog from "../components/images/DeleteImageDialog";
import GalleryLoading from "../components/images/GalleryLoading";
import ServiceStatus from "../components/ServiceStatus";

function History() {
  const token = useSyncExternalStore(tokenStorage.subscribe, tokenStorage.getToken, () => null);
  return <ImageArchive key={token} />;
}

function ImageArchive() {
  const [search, setSearch] = useSearchParams();
  const requestedView = search.get("view");
  const view = requestedView === "favorites" || requestedView === "received" || requestedView === "sent" ? requestedView : "all";
  const showingShares = view === "received" || view === "sent";
  const [shareTarget, setShareTarget] = useState<{ image: ImageMetadata; trigger: HTMLElement } | null>(null);
  const share = (image: ImageMetadata, trigger: HTMLElement) => setShareTarget({ image, trigger });
  const all = useGroupedImageHistory(view === "all");
  const favorites = useFavoriteImages(view === "favorites");
  const favoriteState = useFavorites();
  const active = view === "all" ? all : favorites;
  const { loading, error } = active;
  const data = active.data;
  useRestoreReprocessingScroll(Boolean(data) && !loading);
  const refresh = () => { all.refresh(); favorites.refresh(); };
  const showingFavorites = view === "favorites";
  const [selected, setSelected] = useState<ImageMetadata | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const deletion = useRef<AbortController | null>(null);
  const groups = all.data?.items ?? [];

  useEffect(() => () => deletion.current?.abort(), []);

  async function confirmDelete() {
    if (!selected || deletion.current) return;
    const controller = new AbortController();
    deletion.current = controller;
    all.pause();
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteImage(selected._id, controller.signal);
      if (controller.signal.aborted) return;
      setSelected(null);
      setNotice(selected.kind === "original" ? "Original and its transformed versions deleted." : "Image deleted.");
    } catch (error: unknown) {
      if (!controller.signal.aborted) setDeleteError(getImageErrorMessage(error, "delete"));
    } finally {
      if (deletion.current === controller) deletion.current = null;
      if (!controller.signal.aborted) { setDeleting(false); refresh(); }
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-16" aria-labelledby="images-title">
      <div className="flex flex-wrap justify-between gap-3 border-b border-archive-line pb-5 font-mono text-[11px] text-muted-ink"><span>MOTHFRAME / IMAGE ARCHIVE</span><span>ORIGINALS & THEIR NEW FORMS</span></div>
      <div className="mt-8 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <h1 id="images-title" className="font-editorial text-[40px] leading-[1.1] sm:text-[56px]">Your image archive.</h1>
          <p className="mt-4 max-w-lg text-[15px] leading-[1.8] text-muted-ink">Return to your originals and explore the versions they became. View, download, and manage your saved images.</p>
        </div>
        <Link to="/upload" className="inline-flex min-h-12 shrink-0 items-center gap-5 rounded-sm bg-ink px-5 py-3 text-sm text-paper hover:bg-ink-hover">Upload image <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
      <div role="group" aria-label="Image collection" className="mt-7 flex flex-wrap gap-2">
        {(["all", "favorites", "received", "sent"] as const).map((nextView) => <button key={nextView} type="button" aria-pressed={view === nextView}
          onClick={() => { if (view !== nextView) { all.pause(); favorites.setPage(1); favorites.refresh(); setSearch(nextView === "all" ? {} : { view: nextView }); setNotice(""); } }}
          className={`min-h-11 cursor-pointer rounded-sm border border-archive-line px-5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${view === nextView ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-specimen-paper"}`}>
          {({ all: "All images", favorites: "Favorites", received: "Shared with me", sent: "Sent shares" })[nextView]}
        </button>)}
      </div>
      {showingShares ? <ShareHistory view={view} selectedShareId={search.get("shareId")} /> : <>
      <div className="my-7 flex flex-wrap items-center justify-between gap-3 border-y border-archive-line py-3">
        <p className="text-sm text-muted-ink">{showingFavorites ? (data ? `${data.total} favorite ${data.total === 1 ? "image" : "images"}` : "Your favorite images") : (all.data ? `${all.data.recordCount} of ${all.data.total} saved images loaded · ${groups.length} ${groups.length === 1 ? "group" : "groups"} shown` : "Your saved originals and versions")}</p>
        <button type="button" disabled={loading || deleting || (showingFavorites && favoriteState.rateLimited)} onClick={() => { setNotice(""); refresh(); }} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm underline disabled:cursor-wait disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : ""} />{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      <div role="status" aria-atomic="true" className="mb-4 text-sm text-muted-ink">{notice}{favoriteState.pending ? " Saving favorites…" : ""}{loading && data ? " Updating your images…" : ""}</div>
      <ServiceStatus />
      {favoriteState.error && <div role="alert" className="mb-6 border-l-2 border-ink bg-specimen-paper p-5 text-sm">{favoriteState.error}</div>}
      {error && <div role="alert" className="mb-6 border-l-2 border-ink bg-specimen-paper p-5">
        <p className="text-sm leading-relaxed">{error}</p>
        {data && <p className="mt-2 text-xs text-muted-ink">Showing the last loaded page. It may no longer be current.</p>}
        <button type="button" onClick={showingFavorites ? refresh : all.retry} disabled={showingFavorites && favoriteState.rateLimited} className="disabled:opacity-50 mt-2 min-h-11 cursor-pointer text-sm underline">Retry</button>
      </div>}
      {!data && loading && <GalleryLoading />}
      {data && data.items.length === 0 && !loading && !error && !favoriteState.pending && <div className="border border-dashed border-specimen-line bg-specimen-paper px-6 py-14 text-center">
        <p className="font-mono text-[11px] text-muted-ink">A COLLECTION IN THE MAKING</p>
        <h2 className="mt-4 font-editorial text-4xl">{data.total === 0 ? (showingFavorites ? "No favorites yet." : "No images yet.") : "No records on this page."}</h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-ink">{data.total === 0 ? (showingFavorites ? "Use the heart on any image to save it here." : "Upload and transform your first image to see it here.") : "Your archive may have changed. Refresh to see the latest images."}</p>
        {!showingFavorites && <Link to="/upload" className="mt-6 inline-flex min-h-12 items-center gap-4 rounded-sm bg-ink px-5 text-sm text-paper hover:bg-ink-hover">Upload image <ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>}
      {data && data.items.length > 0 && <>
        {!showingFavorites && <p className="mb-5 text-xs leading-relaxed text-muted-ink">One card per original, newest activity first. Versions join their original as more images load. Legacy images remain visible as separate groups.</p>}
        <div aria-busy={loading} className="grid items-start gap-6 md:grid-cols-2">
          {showingFavorites ? favorites.data?.items.map((image) => <article key={`${image._id}:${image.urlExpiresAt}`} className="min-w-0 overflow-hidden rounded-sm border border-archive-line bg-paper">
            <ImageHistoryItem image={image} onShare={share} deleteDisabled={loading || deleting || Boolean(error)} onDelete={(image) => { setSelected(image); setDeleteError(null); setNotice(""); }} />
          </article>) : groups.map((group) => <ImageGroupCard key={group.key} group={group} onShare={share} incomplete={all.hasMore} deleteDisabled={loading || deleting || Boolean(error)} onDelete={(image) => { setSelected(image); setDeleteError(null); setNotice(""); }} />)}
        </div>
      </>}
      {!showingFavorites && all.data && all.data.recordCount > 0 && <InfiniteImageLoader hasMore={all.hasMore} loading={all.loadingMore} error={all.loadMoreError}
        disabled={deleting || Boolean(selected) || Boolean(shareTarget)} onLoadMore={all.loadMore} onRetry={all.retry} />}
      {showingFavorites && favorites.data && favorites.data.totalPages > 0 && <nav aria-label="Image history pages" className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-archive-line pt-6">
        <button type="button" disabled={loading || deleting || Boolean(error) || favoriteState.rateLimited || favoriteState.pending > 0 || favorites.data.page <= 1} onClick={() => { setNotice(""); favorites.setPage(favorites.data!.page - 1); }} className="min-h-11 cursor-pointer rounded-sm border border-specimen-line px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <p className="text-center text-sm" aria-current="page">Page {favorites.data.page} of {favorites.data.totalPages}
          <span className="block text-xs leading-relaxed text-muted-ink">Showing {(favorites.data.page - 1) * favorites.data.limit + 1}–{Math.min(favorites.data.page * favorites.data.limit, favorites.data.total)} of {favorites.data.total} favorite images</span>
          <span className="block text-xs leading-relaxed text-muted-ink">Up to {favorites.data.limit} cards per page</span>
        </p>
        <button type="button" disabled={loading || deleting || Boolean(error) || favoriteState.rateLimited || favoriteState.pending > 0 || favorites.data.page >= favorites.data.totalPages} onClick={() => { setNotice(""); favorites.setPage(favorites.data!.page + 1); }} className="min-h-11 cursor-pointer rounded-sm border border-specimen-line px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40">Next</button>
      </nav>}
      </>}
      {shareTarget && <ShareImageDialog key={shareTarget.image._id} image={shareTarget.image} returnFocus={shareTarget.trigger} onClose={() => setShareTarget((current) => current === shareTarget ? null : current)} />}
      {selected && <DeleteImageDialog image={selected} pending={deleting} error={deleteError} onCancel={() => { if (!deletion.current) setSelected(null); }} onConfirm={() => { void confirmDelete(); }} onRefresh={() => { setSelected(null); setNotice(""); refresh(); }} />}
    </section>
  );
}

export default History;
