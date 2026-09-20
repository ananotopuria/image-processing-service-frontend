import { Link } from "react-router-dom";
import { useImageHistory } from "../../hooks/useImageHistory";
import GalleryLoading from "./GalleryLoading";
import ImageHistoryItem from "./ImageHistoryItem";

export default function RecentImages() {
  const { data, loading, error, refresh } = useImageHistory(4);
  return (
    <div className="mt-6">
      {!data && loading && <GalleryLoading count={4} />}
      {error && <div role="alert" className="border-l-2 border-ink bg-specimen-paper p-5">
        <p className="text-sm leading-relaxed">{error}</p>
        <button type="button" onClick={refresh} className="mt-2 min-h-11 cursor-pointer text-sm underline">Retry recent images</button>
      </div>}
      {data && !error && data.items.length === 0 && <div className="border border-dashed border-specimen-line bg-specimen-paper p-8">
        <p className="font-editorial text-2xl">No images yet.</p>
        <p className="mt-3 text-sm text-muted-ink">Upload your first image to begin your archive.</p>
        <Link to="/upload" className="mt-3 inline-flex min-h-11 items-center text-sm underline">Upload image</Link>
      </div>}
      {data && data.items.length > 0 && <>
        <p className="mb-4 text-xs text-muted-ink">Your latest saved records, including originals and processed versions.</p>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {data.items.map((image) => <article key={`${image._id}:${image.urlExpiresAt}`} className="min-w-0 overflow-hidden rounded-sm border border-archive-line"><ImageHistoryItem image={image} compact /></article>)}
        </div>
      </>}
      <Link to="/images" className="mt-4 inline-flex min-h-11 items-center text-sm underline">View all images</Link>
    </div>
  );
}
