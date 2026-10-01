import { tokenStorage } from "../auth/tokenStorage";
import { sharingError } from "../api/sharing";
import type { SharingPage } from "../api/sharing.types";

export interface ShareCollection<T> {
  // items accumulate locally; page/limit/total/totalPages come from the API.
  data: SharingPage<T> | null;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}
export const emptyShareCollection = <T>(): ShareCollection<T> => ({ data: null, page: 0, hasMore: true, loading: false, error: null });

// Same lifecycle as All Images: synchronous guard, abort/generation protection,
// deferred Strict Mode setup, and explicit retry after a failed offset page.
export function createInfiniteShares<T extends { _id: string }>(
  loadPage: (page: number, limit: number, signal: AbortSignal) => Promise<SharingPage<T>>,
  onChange: (state: ShareCollection<T>) => void,
) {
  let state = emptyShareCollection<T>();
  let active = false;
  let generation = 0;
  let request: AbortController | null = null;
  let restartOnRetry = false;
  const publish = (next: ShareCollection<T>) => { state = next; onChange(next); };
  function cancel() { generation++; request?.abort(); request = null; }
  async function load(retry = false) {
    const token = tokenStorage.getToken();
    if (!token || request || !state.hasMore || (state.error && !retry)) return;
    const controller = new AbortController(); request = controller;
    const version = generation;
    const current = () => version === generation && !controller.signal.aborted && tokenStorage.getToken() === token;
    publish({ ...state, loading: true, error: null });
    try {
      const result = await loadPage(state.page + 1, 10, controller.signal);
      if (!current()) return;
      const ids = new Set(state.data?.items.map((item) => item._id));
      // Offset pagination has no snapshot token. A count change or overlapping
      // boundary means offsets moved: never append it and silently skip records.
      if (state.data && (result.total !== state.data.total || result.items.some((item) => ids.has(item._id)))) {
        restartOnRetry = true;
        publish({ ...state, loading: false, error: "Your shares changed while loading. Retry to refresh the list." });
        return;
      }
      publish({ data: { ...result, items: [...(state.data?.items ?? []), ...result.items] }, page: result.page,
        hasMore: result.page < result.totalPages && result.items.length > 0, loading: false, error: null });
    } catch (error) {
      if (current()) publish({ ...state, loading: false, error: sharingError(error) });
    } finally { if (request === controller) request = null; }
  }
  async function refresh() {
    cancel(); restartOnRetry = false;
    publish({ ...emptyShareCollection<T>(), loading: Boolean(tokenStorage.getToken()) });
    const version = generation;
    // Coalesce refresh bursts and cancel Strict Mode's discarded setup.
    await Promise.resolve();
    if (version === generation) await load();
  }
  return {
    activate() {
      active = true;
      const version = generation;
      queueMicrotask(() => { if (active && version === generation && !state.data && !state.error) void load(); });
    },
    deactivate() { active = false; cancel(); publish({ ...state, loading: false }); },
    reset() { active = false; cancel(); restartOnRetry = false; publish(emptyShareCollection<T>()); },
    refresh,
    loadMore: () => active ? load() : Promise.resolve(),
    retry: () => restartOnRetry ? refresh() : load(true),
  };
}
