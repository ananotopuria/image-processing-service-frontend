import { tokenStorage } from "../auth/tokenStorage";
import { getNotifications, getReceivedShares, getSentShares, getUnreadCount, markNotificationRead, sharingError } from "../api/sharing";
import type { Share, SentShare, ShareNotification, SharingPage } from "../api/sharing.types";
import { createInfiniteShares, emptyShareCollection } from "./infiniteShares";

export interface Collection<T> { page: number; data: SharingPage<T> | null; loading: boolean; error: string | null }
const collection = <T>(): Collection<T> => ({ page: 1, data: null, loading: false, error: null });
const initial = () => ({ received: emptyShareCollection<Share>(), sent: emptyShareCollection<SentShare>(), notifications: collection<ShareNotification>(),
  unreadCount: null as number | null, unreadError: null as string | null, accessRevision: 0, toast: "", toastRevision: 0, connectionError: "" });

export function createSharingState() {
  let state = initial();
  let generation = 0;
  const listeners = new Set<() => void>();
  const pending = new Map<string, AbortController>();
  const dirty = new Set<string>();
  const seen = new Set<string>();
  const publish = (next: typeof state) => { state = next; listeners.forEach((listener) => listener()); };
  const receivedList = createInfiniteShares(getReceivedShares, (received) => publish({ ...state, received }));
  const sent = createInfiniteShares(getSentShares, (sent) => publish({ ...state, sent }));
  const received = { ...receivedList, refresh() {
    publish({ ...state, accessRevision: state.accessRevision + 1 });
    return receivedList.refresh();
  } };
  function reset() {
    generation++;
    received.reset(); sent.reset();
    for (const request of pending.values()) request.abort();
    pending.clear(); dirty.clear(); seen.clear(); publish(initial());
  }
  async function fetchPage<T>(key: string, page: number, get: () => Collection<T>, set: (value: Collection<T>) => void,
    load: (page: number, limit: number, signal: AbortSignal) => Promise<SharingPage<T>>, invalidate: boolean) {
    if (!tokenStorage.getToken()) return;
    if (pending.has(key)) {
      if (get().page === page) { if (invalidate) dirty.add(key); return; }
      pending.get(key)?.abort(); dirty.delete(key);
    }
    const controller = new AbortController();
    const version = generation;
    pending.set(key, controller);
    set({ page, data: get().page === page ? get().data : null, loading: true, error: null });
    let succeeded = false;
    try {
      const data = await load(page, 10, controller.signal);
      if (controller.signal.aborted || version !== generation) return;
      set({ page, data, loading: false, error: null });
      succeeded = true;
    } catch (error) {
      if (!controller.signal.aborted && version === generation) set({ ...get(), loading: false, error: sharingError(error) });
    } finally {
      if (pending.get(key) === controller) {
        pending.delete(key);
        const again = dirty.delete(key);
        if (again && succeeded && version === generation) void fetchPage(key, page, get, set, load, false);
      }
    }
  }
  const notifications = (page = state.notifications.page, invalidate = false) => fetchPage("notifications", page, () => state.notifications,
    (value) => publish({ ...state, notifications: value }), getNotifications, invalidate);
  async function unread(invalidate = false) {
    if (!tokenStorage.getToken()) return;
    if (pending.has("unread")) { if (invalidate) dirty.add("unread"); return; }
    const controller = new AbortController(); const version = generation;
    pending.set("unread", controller);
    let succeeded = false;
    try {
      const count = await getUnreadCount(controller.signal);
      if (!controller.signal.aborted && version === generation) { publish({ ...state, unreadCount: count, unreadError: null }); succeeded = true; }
    } catch (error) { if (!controller.signal.aborted && version === generation) publish({ ...state, unreadError: sharingError(error) }); }
    finally {
      if (pending.get("unread") === controller) {
        pending.delete("unread");
        if (dirty.delete("unread") && succeeded && version === generation) void unread();
      }
    }
  }
  const recover = () => { void notifications(undefined, true); void unread(true); void received.refresh(); if (state.sent.data || state.sent.loading) void sent.refresh(); };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reset, received, sent, notifications, unread, recover,
    shared(recipientEmail: string) {
      publish({ ...state, toast: `Image shared with ${recipientEmail}.`, toastRevision: state.toastRevision + 1 });
      void sent.refresh();
    },
    notify(notificationId: string) {
      if (seen.has(notificationId)) return;
      seen.add(notificationId);
      publish({ ...state, toast: "An image was shared with you." });
      recover();
    },
    dismissToast: () => publish({ ...state, toast: "" }),
    connectionError: (message: string) => publish({ ...state, connectionError: message }),
    async markRead(notificationId: string) {
      const key = `read:${notificationId}`;
      if (pending.has(key)) return;
      const controller = new AbortController(); const version = generation;
      pending.set(key, controller);
      try {
        await markNotificationRead(notificationId, controller.signal);
        if (!controller.signal.aborted && version === generation) { void notifications(undefined, true); void unread(true); }
      } catch (error) {
        if (!controller.signal.aborted && version === generation) publish({ ...state, toast: `Notification was not marked read. ${sharingError(error)}` });
      } finally { if (pending.get(key) === controller) pending.delete(key); }
    },
  };
}
export const sharingState = createSharingState();
tokenStorage.subscribe(() => sharingState.reset());
