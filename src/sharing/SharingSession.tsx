import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "../auth/useAuth";
import { tokenStorage } from "../auth/tokenStorage";
import { connectSharing } from "./connection";
import { sharingState } from "./state";
import { useSharing } from "./useSharing";

export default function SharingSession() {
  const { isAuthenticated } = useAuth();
  const token = useSyncExternalStore(tokenStorage.subscribe, tokenStorage.getToken, () => null);
  const { toast, toastRevision } = useSharing();
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    const focus = () => { if (document.visibilityState === "visible") sharingState.recover(); };
    // Avoid duplicate transports during Strict Mode's initial effect rehearsal.
    queueMicrotask(() => {
      if (disposed || tokenStorage.getToken() !== token) return;
      sharingState.recover(); // REST still works when the socket cannot connect.
      stop = connectSharing(token);
      window.addEventListener("focus", focus);
      document.addEventListener("visibilitychange", focus);
    });
    return () => { disposed = true; stop?.(); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [isAuthenticated, token]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(sharingState.dismissToast, 6000);
    return () => window.clearTimeout(timer);
  }, [toast, toastRevision]);
  return isAuthenticated ? <div role="status" aria-live="polite" aria-atomic="true">{toast && <div key={toastRevision} className="fixed right-4 bottom-4 left-4 z-50 wrap-anywhere rounded-sm border border-specimen-line bg-paper p-4 text-sm text-ink shadow-lg sm:left-auto sm:max-w-sm">{toast}<button type="button" onClick={sharingState.dismissToast} className="ml-3 min-h-11 cursor-pointer underline">Dismiss</button></div>}</div> : null;
}
