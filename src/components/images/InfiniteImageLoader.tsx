import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";

export default function InfiniteImageLoader({ hasMore, loading, error, disabled, onLoadMore, onRetry, noun = "images" }: {
  hasMore: boolean; loading: boolean; error: string | null; disabled: boolean;
  onLoadMore: () => void; onRetry: () => void;
  noun?: "images" | "shares";
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || loading || error || disabled || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (active && entries.some((entry) => entry.isIntersecting)) onLoadMore();
    }, { rootMargin: "0px 0px 240px 0px" });
    observer.observe(sentinel.current);
    return () => { active = false; observer.disconnect(); };
  }, [hasMore, loading, error, disabled, onLoadMore]);

  return <div className="mt-8 border-t border-archive-line pt-6 text-center text-sm text-muted-ink">
    <div ref={sentinel} aria-hidden="true" className="h-px" />
    {loading && <p role="status" className="flex items-center justify-center gap-2"><LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Loading more {noun}…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={disabled} onClick={onRetry} className="min-h-11 cursor-pointer px-3 underline disabled:opacity-50">Retry</button></div>}
    {!loading && !error && !hasMore && <p role="status">You’ve reached the end of your {noun}.</p>}
    {hasMore && !loading && !error && typeof IntersectionObserver === "undefined" && <button type="button" disabled={disabled} onClick={onLoadMore} className="min-h-11 cursor-pointer px-3 underline disabled:opacity-50">Load more {noun}</button>}
  </div>;
}
