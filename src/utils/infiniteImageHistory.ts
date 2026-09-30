import { getImages } from "../api/images";
import { getImageErrorMessage } from "../api/imageErrors";
import type { ImageMetadata, PaginatedImagesResponse } from "../api/images.types";
import { favoriteState } from "./favorites";

export const IMAGE_BATCH_SIZE = 10;
type LoadPage = (page: number, limit: number, signal: AbortSignal) => Promise<PaginatedImagesResponse>;
interface Snapshot {
  records: ImageMetadata[];
  total: number | null;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}
const empty = (): Snapshot => ({ records: [], total: null, page: 0, hasMore: true, loading: true, error: null });

// An instance belongs to one collection/query. As with favoriteState, the
// synchronous request guard lives outside React renders so observer bursts cannot
// issue the same page twice. Nothing is persisted across mounts or accounts.
export function createInfiniteImageHistory(loadPage: LoadPage = getImages) {
  let snapshot = empty();
  let active = false;
  let paused = false;
  let generation = 0;
  let request: AbortController | null = null;
  let restartOnRetry = false;
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  function cancel() {
    generation++;
    request?.abort();
    request = null;
  }
  async function loadMore(retry = false) {
    if (!active || paused || request || !snapshot.hasMore || (snapshot.error && !retry)) return;
    const controller = new AbortController();
    const version = generation;
    const ticket = favoriteState.read();
    const current = () => active && generation === version && !controller.signal.aborted && favoriteState.current(ticket);
    request = controller;
    publish({ ...snapshot, loading: true, error: null });
    try {
      const result = await loadPage(snapshot.page + 1, IMAGE_BATCH_SIZE, controller.signal);
      if (!current()) return;
      // Offset pages are not a snapshot. If a concurrent edit changed the count,
      // keep the visible images but require a manual restart from page one.
      if (snapshot.total !== null && result.total !== snapshot.total) {
        restartOnRetry = true;
        publish({ ...snapshot, loading: false, error: "Your archive changed while loading. Retry to refresh the list." });
        return;
      }
      const records = new Map(snapshot.records.map((image) => [image._id, image]));
      for (const image of result.items) if (!records.has(image._id)) records.set(image._id, image);
      publish({ records: [...records.values()], total: result.total, page: result.page,
        hasMore: result.page < result.totalPages && result.items.length > 0, loading: false, error: null });
    } catch (error: unknown) {
      if (current()) publish({ ...snapshot, loading: false, error: getImageErrorMessage(error, "load") });
    } finally {
      if (request === controller) request = null;
    }
  }
  function refresh() {
    cancel();
    paused = false;
    restartOnRetry = false;
    publish(empty());
    const version = generation;
    // Strict Mode's setup/cleanup/setup cancels the first scheduled request
    // before transport; unmount and query changes use the same generation guard.
    queueMicrotask(() => { if (active && version === generation) void loadMore(); });
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    start() { active = true; refresh(); },
    stop() { active = false; cancel(); },
    // Freeze offsets before a deletion, including a next-page request in flight.
    pause() { paused = true; cancel(); publish({ ...snapshot, loading: false }); },
    refresh,
    loadMore: () => loadMore(),
    retry: () => { if (restartOnRetry) refresh(); else void loadMore(true); },
  };
}
