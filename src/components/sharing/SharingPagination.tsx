export default function SharingPagination({ page, totalPages, loading, onPage }: { page: number; totalPages: number; loading: boolean; onPage: (page: number) => void }) {
  if (totalPages < 2 && page === 1) return null;
  return <nav aria-label="Sharing pages" className="mt-5 flex items-center justify-between gap-3 border-t border-archive-line pt-3 text-sm">
    <button type="button" disabled={loading || page <= 1} onClick={() => onPage(page - 1)} className="min-h-11 cursor-pointer px-2 underline disabled:opacity-40">Previous</button>
    <span>Page {page} · {totalPages} {totalPages === 1 ? "page" : "pages"} available</span>
    <button type="button" disabled={loading || page >= totalPages} onClick={() => onPage(page + 1)} className="min-h-11 cursor-pointer px-2 underline disabled:opacity-40">Next</button>
  </nav>;
}
