import { io } from "socket.io-client";
import { apiClient } from "../api/client";
import { isSharingId } from "../api/sharing";
import { tokenStorage } from "../auth/tokenStorage";
import { sharingState } from "./state";

export function connectSharing(token: string, createSocket = io) {
  const socket = createSocket(`${apiClient.defaults.baseURL}/notifications`, {
    path: "/socket.io", auth: { token }, autoConnect: false, forceNew: true,
  });
  let active = true;
  const current = () => active && tokenStorage.getToken() === token;
  const expired = () => { if (current()) tokenStorage.clearToken(); };
  const connected = () => { if (current()) { sharingState.connectionError(""); sharingState.recover(); } };
  const created = (value: unknown) => {
    if (!current() || !value || typeof value !== "object") return;
    const event = value as Record<string, unknown>;
    if (isSharingId(event.notificationId) && isSharingId(event.shareId) && event.type === "image.shared" && typeof event.createdAt === "string") sharingState.notify(event.notificationId);
  };
  const failed = (error: Error & { data?: { code?: string } }) => {
    if (!current()) return;
    if (error.data?.code === "UNAUTHORIZED") expired();
    else sharingState.connectionError("Live updates are unavailable. Your saved notifications can still be refreshed.");
  };
  const disconnected = () => { if (current()) sharingState.connectionError("Live updates disconnected. Refresh to check for new shares."); };
  socket.on("connect", connected);
  socket.on("notification.created", created);
  socket.on("auth.expired", expired);
  socket.on("connect_error", failed);
  socket.on("disconnect", disconnected);
  const unsubscribe = tokenStorage.subscribe(() => { if (tokenStorage.getToken() !== token) stop(); });
  function stop() {
    if (!active) return;
    active = false; unsubscribe();
    socket.off("connect", connected); socket.off("notification.created", created); socket.off("auth.expired", expired);
    socket.off("connect_error", failed); socket.off("disconnect", disconnected); socket.disconnect();
  }
  socket.connect();
  return stop;
}
