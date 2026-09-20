export default function GalleryLoading({ count = 4 }: { count?: number }) {
  return (
    <div>
      <p role="status" className="mb-5 text-sm text-muted-ink">Loading images…</p>
      <div aria-hidden="true" className="grid gap-6 sm:grid-cols-2">
        {Array.from({ length: count }, (_, index) => <div key={index} className="overflow-hidden rounded-sm border border-archive-line">
          <div className="aspect-4/3 animate-pulse bg-specimen-paper motion-reduce:animate-none" />
          <div className="space-y-3 p-5"><div className="h-5 w-2/3 bg-specimen-paper" /><div className="h-3 w-1/2 bg-specimen-paper" /></div>
        </div>)}
      </div>
    </div>
  );
}
