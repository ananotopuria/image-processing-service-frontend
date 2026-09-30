import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createInfiniteImageHistory } from "../utils/infiniteImageHistory";
import { groupImagesByOriginal } from "../utils/imageHistory";

// Include any future server-supported filters/sort in queryKey. A different key
// gets an empty store immediately; cleanup aborts the old collection's requests.
export function useGroupedImageHistory(enabled = true, queryKey = "all:newest") {
  const store = useMemo(() => {
    // The key scopes the store even though this endpoint currently has no filters.
    void queryKey;
    void enabled;
    return createInfiniteImageHistory();
  }, [queryKey, enabled]);
  const result = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    if (!enabled) return;
    store.start();
    return () => store.stop();
  }, [store, enabled]);
  const groups = useMemo(() => groupImagesByOriginal(result.records), [result.records]);
  return {
    data: enabled && result.total !== null ? { items: groups, total: result.total, recordCount: result.records.length } : null,
    loading: enabled && result.loading && result.total === null,
    loadingMore: enabled && result.loading && result.total !== null,
    error: result.total === null ? result.error : null,
    loadMoreError: result.total !== null ? result.error : null,
    hasMore: result.hasMore,
    loadMore: store.loadMore,
    retry: store.retry,
    refresh: store.refresh,
    pause: store.pause,
  };
}
