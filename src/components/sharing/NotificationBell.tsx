import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { sharedHistoryUrl } from "../../api/sharing";
import { sharingState } from "../../sharing/state";
import { useSharing } from "../../sharing/useSharing";
import SharingPagination from "./SharingPagination";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, unreadError, connectionError } = useSharing();
  const root = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    void sharingState.notifications(1); void sharingState.unread();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const refresh = () => { void sharingState.notifications(undefined, true); void sharingState.unread(true); };
  return <div ref={root} className="sm:relative" onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls="notification-panel" aria-label={`Notifications${unreadCount === null ? "" : `, ${unreadCount} unread`}`} onClick={() => setOpen((value) => !value)}
      className="relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-sm border border-archive-line"><Bell size={18} aria-hidden="true" />
      {unreadCount !== null && unreadCount > 0 && <span aria-hidden="true" className="absolute -top-2 -right-2 min-w-5 rounded-full bg-ink px-1 py-0.5 text-center font-mono text-[10px] text-paper">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section id="notification-panel" aria-label="Notifications" className="absolute top-full right-6 z-40 mt-3 sm:top-auto sm:right-0 max-h-[70dvh] w-[min(22rem,calc(100vw-3rem))] overflow-y-auto rounded-sm border border-archive-line bg-paper p-5 shadow-lg">
      <div className="flex items-center justify-between gap-3"><h2 className="font-editorial text-2xl">Notifications</h2><button type="button" disabled={notifications.loading} onClick={refresh} className="min-h-11 cursor-pointer text-xs underline disabled:opacity-50">Refresh</button></div>
      {unreadCount !== null && <p className="mb-3 text-xs text-muted-ink">{unreadCount} unread</p>}
      {connectionError && <p className="mb-3 text-xs text-muted-ink">{connectionError}</p>}
      {(notifications.error || unreadError) && <div role="alert" className="mb-3 text-sm"><p>{notifications.error ?? unreadError}</p><button type="button" onClick={refresh} disabled={notifications.loading} className="min-h-11 cursor-pointer underline">Retry</button></div>}
      {notifications.loading && <p role="status" className="py-3 text-xs text-muted-ink">Loading notifications…</p>}
      {notifications.data?.items.length === 0 && !notifications.loading && <p className="py-4 text-sm text-muted-ink">No notifications on this page.</p>}
      <ul className="divide-y divide-archive-line">{notifications.data?.items.map((item) => <li key={item._id}>
        <Link to={sharedHistoryUrl(item.shareId)} onClick={() => { void sharingState.markRead(item._id); setOpen(false); }} className="block py-4 text-sm hover:bg-specimen-paper">
          <span className={item.readAt ? "" : "font-semibold"}>{item.readAt ? "" : "Unread · "}An image was shared with you.</span>
          {!item.available && <span className="mt-1 block text-xs text-muted-ink">This share is no longer available.</span>}
          <time dateTime={item.createdAt} className="mt-2 block text-xs text-muted-ink">{new Date(item.createdAt).toLocaleString("en-US")}</time>
        </Link>
      </li>)}</ul>
      {notifications.data && <SharingPagination page={notifications.page} totalPages={notifications.data.totalPages} loading={notifications.loading} onPage={(page) => { void sharingState.notifications(page); }} />}
    </section>}
  </div>;
}
