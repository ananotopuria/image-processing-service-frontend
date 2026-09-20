import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { deleteImage } from "../api/images";
import type { ImageMetadata } from "../api/images.types";
import { getImageErrorMessage } from "../api/imageErrors";
import { useImageHistory } from "../hooks/useImageHistory";
import { groupImagesByOriginal } from "../utils/imageHistory";
import ImageGroupCard from "../components/images/ImageGroupCard";
import DeleteImageDialog from "../components/images/DeleteImageDialog";
import GalleryLoading from "../components/images/GalleryLoading";

function History() {
  const { data, loading, error, setPage, refresh } = useImageHistory();
  const [selected, setSelected] = useState<ImageMetadata | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const deletion = useRef<AbortController | null>(null);
  const groups = groupImagesByOriginal(data?.items ?? []);

  useEffect(() => () => deletion.current?.abort(), []);

  async function confirmDelete() {
    if (!selected || deletion.current) return;
    const controller = new AbortController();
    deletion.current = controller;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteImage(selected._id, controller.signal);
      if (controller.signal.aborted) return;
      setSelected(null);
      setNotice(selected.kind === "original" ? "Original and its transformed versions deleted." : "Image deleted.");
      refresh();
    } catch (error: unknown) {
      if (!controller.signal.aborted) setDeleteError(getImageErrorMessage(error, "delete"));
    } finally {
      if (deletion.current === controller) deletion.current = null;
      if (!controller.signal.aborted) setDeleting(false);
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
      <div className="my-7 flex flex-wrap items-center justify-between gap-3 border-y border-archive-line py-3">
        <p className="text-sm text-muted-ink">{data ? `${data.total} image ${data.total === 1 ? "record" : "records"} · originals, versions, and legacy images` : "Your saved originals and versions"}</p>
        <button type="button" disabled={loading || deleting} onClick={() => { setNotice(""); refresh(); }} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm underline disabled:cursor-wait disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : ""} />{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      <div role="status" aria-atomic="true" className="mb-4 text-sm text-muted-ink">{notice}{loading && data ? " Updating this page of the archive…" : ""}</div>
      {error && <div role="alert" className="mb-6 border-l-2 border-ink bg-specimen-paper p-5">
        <p className="text-sm leading-relaxed">{error}</p>
        {data && <p className="mt-2 text-xs text-muted-ink">Showing the last loaded page. It may no longer be current.</p>}
        <button type="button" onClick={refresh} className="mt-2 min-h-11 cursor-pointer text-sm underline">Retry</button>
      </div>}
      {!data && loading && <GalleryLoading />}
      {data && data.items.length === 0 && !loading && !error && <div className="border border-dashed border-specimen-line bg-specimen-paper px-6 py-14 text-center">
        <p className="font-mono text-[11px] text-muted-ink">A COLLECTION IN THE MAKING</p>
        <h2 className="mt-4 font-editorial text-4xl">{data.total === 0 ? "No images yet." : "No records on this page."}</h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-ink">{data.total === 0 ? "Upload and transform your first image to see it here." : "Your archive may have changed. Refresh to see the latest images."}</p>
        <Link to="/upload" className="mt-6 inline-flex min-h-12 items-center gap-4 rounded-sm bg-ink px-5 text-sm text-paper hover:bg-ink-hover">Upload image <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>}
      {data && data.items.length > 0 && <>
        <p className="mb-5 text-xs leading-relaxed text-muted-ink">Newest records first. Groups include only records on this page; an original and its versions may appear on different pages.</p>
        <div aria-busy={loading} className="grid items-start gap-6 md:grid-cols-2">
          {groups.map((group) => <ImageGroupCard key={group.key} group={group} deleteDisabled={loading || deleting || Boolean(error)} onDelete={(image) => { setSelected(image); setDeleteError(null); setNotice(""); }} />)}
        </div>
      </>}
      {data && data.totalPages > 0 && <nav aria-label="Image history pages" className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-archive-line pt-6">
        <button type="button" disabled={loading || deleting || data.page <= 1} onClick={() => { setNotice(""); setPage(data.page - 1); }} className="min-h-11 cursor-pointer rounded-sm border border-specimen-line px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <p className="text-sm" aria-current="page">Page {data.page} of {data.totalPages} <span className="block text-center text-xs text-muted-ink">{data.limit} records per page</span></p>
        <button type="button" disabled={loading || deleting || data.page >= data.totalPages || data.page >= 100000} onClick={() => { setNotice(""); setPage(data.page + 1); }} className="min-h-11 cursor-pointer rounded-sm border border-specimen-line px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40">Next</button>
      </nav>}
      {selected && <DeleteImageDialog image={selected} pending={deleting} error={deleteError} onCancel={() => { if (!deletion.current) setSelected(null); }} onConfirm={() => { void confirmDelete(); }} onRefresh={() => { setSelected(null); setNotice(""); refresh(); }} />}
    </section>
  );
}

export default History;
