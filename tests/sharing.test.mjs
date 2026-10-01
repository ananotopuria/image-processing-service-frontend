import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { AxiosError, AxiosHeaders } from "axios";
import { EventEmitter } from "node:events";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const stored = new Map();
globalThis.window = { localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) }, addEventListener() {} };
process.env.VITE_API_URL = "https://api.example.test";
const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, logLevel: "error" });
const api = await vite.ssrLoadModule("/src/api/sharing.ts");
const { apiClient } = await vite.ssrLoadModule("/src/api/client.ts");
const { tokenStorage } = await vite.ssrLoadModule("/src/auth/tokenStorage.ts");
const { sharingState, createSharingState } = await vite.ssrLoadModule("/src/sharing/state.ts");
const { createShareSubmission } = await vite.ssrLoadModule("/src/sharing/submission.ts");
const { getImageById } = await vite.ssrLoadModule("/src/api/images.ts");
const { default: SentSharePreview, ResolvedPreview } = await vite.ssrLoadModule("/src/components/sharing/SentSharePreview.tsx");
const { default: SharingSession } = await vite.ssrLoadModule("/src/sharing/SharingSession.tsx");
const { connectSharing } = await vite.ssrLoadModule("/src/sharing/connection.ts");
const { AuthContext } = await vite.ssrLoadModule("/src/auth/AuthContext.ts");
const { default: ShareImageDialog } = await vite.ssrLoadModule("/src/components/sharing/ShareImageDialog.tsx");
const { default: ShareHistory } = await vite.ssrLoadModule("/src/components/sharing/ShareHistory.tsx");
const { default: ReceivedShareCard } = await vite.ssrLoadModule("/src/components/sharing/ReceivedShareCard.tsx");
const { default: ImageGroupCard } = await vite.ssrLoadModule("/src/components/images/ImageGroupCard.tsx");
const { default: History } = await vite.ssrLoadModule("/src/pages/History.tsx");
const { default: PublicHeader } = await vite.ssrLoadModule("/src/components/header/PublicHeader.tsx");
const { groupImagesByOriginal } = await vite.ssrLoadModule("/src/utils/imageHistory.ts");
const { authDestination } = await vite.ssrLoadModule("/src/auth/destination.ts");
const ids = Array.from({ length: 7 }, (_, index) => (index + 1).toString(16).padStart(24, "0"));
const share = { _id: ids[0], imageId: ids[1], senderId: ids[2], recipientId: ids[3], revokedAt: null, createdAt: "2026-09-30T12:00:00Z", updatedAt: "2026-09-30T12:00:00Z", available: true };
const notification = { _id: ids[4], type: "image.shared", shareId: share._id, readAt: null, createdAt: share.createdAt, updatedAt: share.updatedAt, available: true };
const image = { _id: share.imageId, kind: "transformed", filename: "photo.webp", format: "webp", mimeType: "image/webp", width: 800, height: 600, url: "https://storage.example.test/photo.webp?signature=preview", downloadUrl: "https://storage.example.test/photo.webp?response-content-disposition=attachment&signature=download", urlExpiresAt: "2099-01-01T00:00:00Z" };
const sentShare = { ...share, recipientEmail: "recipient@example.com", image: { filename: "photo.webp", format: "webp" } };
const page = (items, page = 1, limit = 10, total = items.length) => ({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
const response = (config, data, status = 200) => ({ config, data, status, statusText: "", headers: new AxiosHeaders() });
const httpError = (config, status, message, headers = {}) => new AxiosError("private internal details", undefined, config, undefined, { ...response(config, { message }, status), headers: new AxiosHeaders(headers) });
const signal = () => new AbortController().signal;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const render = (component, props = {}, authenticated = true, url = "/images") => renderToStaticMarkup(createElement(AuthContext.Provider, { value: { isAuthenticated: authenticated, user: { email: "owner@example.test" }, logout() {} } }, createElement(MemoryRouter, { initialEntries: [url] }, createElement(component, props))));
function serve(calls = []) {
  apiClient.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, params: config.params });
    assert.equal(config.headers.get("Authorization"), `Bearer ${tokenStorage.getToken()}`);
    if (config.url === "/api/notifications/unread-count") return response(config, { unreadCount: 1 });
    if (config.url === "/api/notifications") return response(config, page([notification], config.params.page, config.params.limit));
    if (config.url === "/api/shares/received") return response(config, page([share], config.params.page, config.params.limit));
    if (config.url === "/api/shares/sent") return response(config, page([sentShare], config.params.page, config.params.limit));
    if (config.url === `/api/shares/${share._id}`) return response(config, { share, image });
    throw Error(`Unexpected endpoint: ${config.url}`);
  };
}
beforeEach(() => { tokenStorage.clearToken(); tokenStorage.setToken("test-session-token"); serve(); });
after(async () => { sharingState.reset(); await vite.close(); delete globalThis.window; });

test("create uses the exact record ID, normalized email, JSON body and existing JWT client", async () => {
  apiClient.defaults.adapter = async (config) => {
    assert.equal(config.url, "/api/shares"); assert.equal(config.method, "post");
    assert.deepEqual(JSON.parse(config.data), { imageId: share.imageId, recipientEmail: "recipient@example.com" });
    assert.match(config.headers.get("Content-Type"), /application\/json/);
    assert.equal(config.headers.get("Authorization"), "Bearer test-session-token");
    return response(config, share, 201);
  };
  assert.deepEqual(await api.createShare(share.imageId, " Recipient@Example.com ", signal()), share);
});

test("share and notification lists preserve exact pagination parameters and envelopes", async () => {
  for (const [send, path] of [[api.getReceivedShares, "/api/shares/received"], [api.getSentShares, "/api/shares/sent"], [api.getNotifications, "/api/notifications"]]) {
    apiClient.defaults.adapter = async (config) => {
      assert.equal(config.url, path); assert.deepEqual(config.params, { page: 2, limit: 10 });
      return response(config, page([], 2, 10, 1));
    };
    assert.deepEqual(await send(2, 10, signal()), page([], 2, 10, 1));
    for (const [p, limit] of [[0, 10], [100001, 10], [1, 51], [1.1, 10]]) await assert.rejects(send(p, limit, signal()), /valid page/);
  }
});

test("malformed lists, duplicate IDs and mismatched detail IDs are rejected", async () => {
  for (const data of [page([share, share]), { ...page([share]), totalPages: 5 }, page([{ ...share, recipientId: "wrong" }])]) {
    apiClient.defaults.adapter = async (config) => response(config, data);
    await assert.rejects(api.getReceivedShares(1, 10, signal()), /incomplete sharing/);
  }
  apiClient.defaults.adapter = async (config) => response(config, { share, image: { ...image, _id: ids[6] } });
  await assert.rejects(api.getSharedAccess(share._id, signal()), /incomplete sharing/);
});

test("received preview and download links are fetched only through share ID, never owner endpoints", async () => {
  const calls = []; serve(calls);
  const access = await api.getSharedAccess(share._id, signal());
  assert.equal(access.image.filename, "photo.webp");
  assert.equal(access.image.downloadUrl, image.downloadUrl);
  assert.deepEqual(calls.map((call) => call.url), [`/api/shares/${share._id}`]);
  apiClient.defaults.adapter = async (config) => { throw httpError(config, 404, "Shared image is unavailable"); };
  await assert.rejects(api.getSharedAccess(share._id, signal()), (error) => error.response.status === 404);
  await assert.rejects(api.getSharedAccess("bad-id", signal()), /invalid/);
});

test("revocation and marking read send no bodies and validate persisted responses", async () => {
  apiClient.defaults.adapter = async (config) => {
    assert.equal(config.data, undefined);
    if (config.method === "delete") { assert.equal(config.url, `/api/shares/${share._id}`); return response(config, { ...share, available: false, revokedAt: share.createdAt }); }
    assert.equal(config.method, "put"); assert.equal(config.url, `/api/notifications/${notification._id}/read`);
    return response(config, { ...notification, readAt: notification.createdAt });
  };
  assert.equal((await api.revokeShare(share._id, signal())).available, false);
  assert.equal((await api.markNotificationRead(notification._id, signal())).readAt, notification.createdAt);
});

test("errors distinguish invalid email, missing recipient, self-share, duplicate and unavailable access", () => {
  for (const [status, message, expected] of [[400, ["recipientEmail must be an email"], /valid recipient email/], [400, "Cannot share an image with yourself", /yourself/], [404, "Recipient not found", /No registered account/], [409, "An active share already exists for this image and recipient", /already shared/], [404, "Shared image is unavailable", /no longer available/], [502, "Unable to create image access URLs", /Temporary image links/]]) {
    assert.match(api.sharingError(httpError({}, status, message)), expected);
  }
  assert.doesNotMatch(api.sharingError(httpError({}, 500, "database password secret")), /database|password|secret|internal/);
});

test("Retry-After prevents repeated transport until the route cooldown ends", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  let calls = 0;
  apiClient.defaults.adapter = async (config) => { calls++; throw httpError(config, 429, "ThrottlerException: Too Many Requests", { "Retry-After": "10" }); };
  await assert.rejects(api.createShare(share.imageId, "person@example.test", signal()));
  await assert.rejects(api.createShare(share.imageId, "person@example.test", signal()), /10 seconds/);
  assert.equal(calls, 1);
  t.mock.timers.tick(10001);
  await assert.rejects(api.createShare(share.imageId, "person@example.test", signal()));
  assert.equal(calls, 2);
});

test("account reset aborts requests and prevents old data, URLs, labels and unread counts leaking", async () => {
  let release; let oldSignal;
  apiClient.defaults.adapter = async (config) => { oldSignal = config.signal; return new Promise((resolve) => { release = () => resolve(response(config, page([share]))); }); };
  const pending = sharingState.received.refresh(); await settle();
  tokenStorage.clearToken();
  assert.equal(oldSignal.aborted, true);
  release(); await pending;
  assert.equal(sharingState.getSnapshot().received.data, null);
  assert.equal(sharingState.getSnapshot().unreadCount, null);
  assert.equal(sharingState.getSnapshot().sent.data, null);
});

test("REST recovery fetches notifications, unread count and received shares and event IDs deduplicate", async () => {
  const calls = []; serve(calls);
  const store = createSharingState();
  store.recover(); await settle();
  assert.deepEqual(calls.map((call) => call.url).sort(), ["/api/notifications", "/api/notifications/unread-count", "/api/shares/received"]);
  assert.equal(store.getSnapshot().unreadCount, 1);
  calls.length = 0;
  store.notify(notification._id); store.notify(notification._id); await settle();
  assert.equal(calls.length, 3);
  assert.match(store.getSnapshot().toast, /shared with you/);
  store.reset();
});

test("failed explicit refresh resets offsets and does not automatically retry", async () => {
  const store = createSharingState(); await store.received.refresh();
  let calls = 0;
  apiClient.defaults.adapter = async (config) => { calls++; throw httpError(config, 500, "secret"); };
  await store.received.refresh(); await settle();
  assert.equal(store.getSnapshot().received.data, null);
  assert.ok(store.getSnapshot().received.error);
  assert.equal(calls, 1);
  store.reset();
});

function socketFactory() {
  const socket = new EventEmitter();
  socket.connectCount = 0; socket.disconnectCount = 0;
  socket.connect = () => { assert.ok(socket.listenerCount("notification.created")); socket.connectCount++; return socket; };
  socket.disconnect = () => { socket.disconnectCount++; return socket; };
  let settings;
  const factory = (url, options) => { settings = { url, options }; return socket; };
  return { socket, factory, settings: () => settings };
}

test("Socket.IO uses the origin namespace, raw JWT and Engine.IO path with listeners before connecting", async () => {
  const { socket, factory, settings } = socketFactory();
  const stop = connectSharing(tokenStorage.getToken(), factory);
  assert.deepEqual(settings(), { url: "https://api.example.test/notifications", options: { path: "/socket.io", auth: { token: "test-session-token" }, autoConnect: false, forceNew: true } });
  assert.equal(socket.connectCount, 1);
  socket.emit("connect"); await settle();
  assert.equal(sharingState.getSnapshot().unreadCount, 1);
  stop(); stop();
  assert.equal(socket.disconnectCount, 1);
  assert.equal(socket.eventNames().length, 0);
});

test("connect/reconnect recover REST data; notification hints deduplicate and never carry image data", async () => {
  const calls = []; serve(calls);
  const { socket, factory } = socketFactory(); const stop = connectSharing(tokenStorage.getToken(), factory);
  socket.emit("connect"); await settle();
  socket.emit("connect"); await settle();
  assert.equal(calls.length, 6);
  const event = { notificationId: notification._id, type: "image.shared", shareId: share._id, createdAt: notification.createdAt };
  socket.emit("notification.created", event); socket.emit("notification.created", event); await settle();
  assert.equal(calls.length, 9);
  socket.emit("notification.created", { ...event, notificationId: "bad" }); await settle();
  assert.equal(calls.length, 9);
  stop();
});

test("logout, token replacement, expiry and unauthorized socket errors disconnect and clear session data", async () => {
  for (const cause of ["logout", "replace", "expired", "unauthorized"]) {
    tokenStorage.setToken(`session-${cause}`);
    const { socket, factory } = socketFactory(); const stop = connectSharing(tokenStorage.getToken(), factory);
    if (cause === "logout") tokenStorage.clearToken();
    if (cause === "replace") tokenStorage.setToken("new-session");
    if (cause === "expired") socket.emit("auth.expired", { code: "TOKEN_EXPIRED" });
    if (cause === "unauthorized") socket.emit("connect_error", { data: { code: "UNAUTHORIZED" } });
    assert.equal(socket.disconnectCount, 1, cause);
    assert.equal(socket.listenerCount("notification.created"), 0);
    assert.equal(sharingState.getSnapshot().notifications.data, null);
    assert.equal(tokenStorage.getToken(), cause === "replace" ? "new-session" : null);
    stop();
  }
});

test("transport/origin socket errors retain the REST session instead of logging the user out", () => {
  const { socket, factory } = socketFactory(); const stop = connectSharing(tokenStorage.getToken(), factory);
  socket.emit("connect_error", new Error("transport error"));
  assert.equal(tokenStorage.getToken(), "test-session-token");
  assert.match(sharingState.getSnapshot().connectionError, /saved notifications/);
  stop();
});

test("marking a persisted notification read refetches list and unread count", async () => {
  let read = false; const calls = [];
  apiClient.defaults.adapter = async (config) => {
    calls.push(config.url);
    if (config.method === "put") { read = true; return response(config, { ...notification, readAt: notification.createdAt }); }
    if (config.url.endsWith("unread-count")) return response(config, { unreadCount: read ? 0 : 1 });
    return response(config, page([{ ...notification, readAt: read ? notification.createdAt : null }]));
  };
  await sharingState.markRead(notification._id); await settle();
  assert.equal(sharingState.getSnapshot().unreadCount, 0);
  assert.ok(sharingState.getSnapshot().notifications.data.items[0].readAt);
  assert.equal(calls.length, 3);
});

test("History retains owned collections and exposes received/sent views without owner actions", () => {
  const html = render(History);
  for (const text of ["All images", "Favorites", "Shared with me", "Sent shares", "Loading images"]) assert.ok(html.includes(text));
  const received = render(ReceivedShareCard, { shareId: share._id, available: false, revision: 0 });
  assert.match(received, /revoked or the image was deleted/);
  assert.doesNotMatch(received, /Transform again|Delete|Favorite|Revoke|Download|Share image/);
  const available = render(ReceivedShareCard, { shareId: share._id, revision: 0 });
  assert.match(available, /Download/);
  assert.doesNotMatch(available, /Transform again|Delete|Favorite|Share image/);
});

test("owned originals and processed versions each expose Share for their own record", () => {
  const original = { ...image, _id: ids[5], originalName: "photo.jpg", kind: "original", format: "jpeg", originalSize: 1000, isFavorite: false };
  const version = { ...original, _id: image._id, originalImageId: original._id, kind: "transformed", format: "webp" };
  const group = groupImagesByOriginal([version, original])[0];
  const markup = render(ImageGroupCard, { group, deleteDisabled: false, onDelete() {}, onShare() {} });
  assert.match(markup, /aria-label="Share photo.jpg"/);
  assert.match(markup, /aria-label="Share photo.webp"/);
  const dialog = render(ShareImageDialog, { image: version, returnFocus: {}, onClose() {} });
  assert.match(dialog, /photo.webp/); assert.match(dialog, /type="email"/);
  assert.match(dialog, /aria-labelledby="share-title"/); assert.match(dialog, /Close share dialog/);
});

test("sent shares render persisted email and filename after reset and sign-in, with singular counts", async () => {
  for (const reset of [() => {}, () => sharingState.reset(), () => { tokenStorage.clearToken(); tokenStorage.setToken("signed-in-again"); }]) {
    reset();
    await sharingState.sent.refresh();
    const markup = render(ShareHistory, { view: "sent", selectedShareId: null });
    assert.match(markup, /recipient@example.com/); assert.match(markup, /photo.webp/); assert.match(markup, /Revoke share/);
    assert.match(markup, /1 sent share</); assert.doesNotMatch(markup, /1 sent shares|Email unavailable|Image 000/);
  }
});

test("sent shares handle explicit deleted records and revoked history without fabricated labels", async () => {
  apiClient.defaults.adapter = async (config) => response(config, page([
    { ...sentShare, recipientEmail: null, image: null, available: false },
    { ...sentShare, _id: ids[6], revokedAt: share.createdAt, available: false },
  ]));
  await sharingState.sent.refresh();
  const markup = render(ShareHistory, { view: "sent", selectedShareId: null });
  assert.match(markup, /2 sent shares/); assert.match(markup, /Account deleted/);
  assert.match(markup, /Image unavailable/); assert.match(markup, /Revoked/);
  assert.match(markup, /recipient@example.com/); assert.match(markup, /photo.webp/);
  assert.equal((markup.match(/Revoke share/g) ?? []).length, 1);
});

test("missing sent-share fields are contract errors, distinct from explicit deleted-record nulls", async () => {
  for (const item of [share, { ...sentShare, recipientEmail: undefined }, { ...sentShare, image: undefined },
    { ...sentShare, recipientEmail: "" }, { ...sentShare, image: { filename: "photo.webp", format: "gif" } }]) {
    apiClient.defaults.adapter = async (config) => response(config, page([item]));
    await assert.rejects(api.getSentShares(1, 10, signal()), /incomplete sharing/);
  }
  apiClient.defaults.adapter = async (config) => response(config, page([share]));
  await sharingState.sent.refresh();
  const markup = render(ShareHistory, { view: "sent", selectedShareId: null });
  assert.match(markup, /incomplete sharing details/); assert.match(markup, /Retry/);
  assert.doesNotMatch(markup, /Account deleted|Email unavailable/);
});

test("notification links preserve exact received-share intent through authentication", () => {
  const destination = api.sharedHistoryUrl(share._id);
  assert.equal(destination, `/images?view=received&shareId=${share._id}`);
  assert.equal(authDestination({ returnTo: destination }), destination);
  assert.equal(authDestination({ returnTo: "https://example.com" }), "/dashboard");
  assert.equal(authDestination({ returnTo: "/images?view=received&shareId=bad" }), "/dashboard");
  assert.match(render(PublicHeader), /Notifications/);
  assert.doesNotMatch(render(PublicHeader, {}, false), /Notifications/);
});


test("late mutations from a previous session cannot populate the next account's state", async () => {
  let release;
  apiClient.defaults.adapter = async (config) => new Promise((resolve) => { release = () => resolve(response(config, share, 201)); });
  const pending = api.createShare(share.imageId, "recipient@example.com", signal());
  await settle();
  tokenStorage.setToken("another-account");
  release();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  assert.equal(sharingState.getSnapshot().sent.data, null);
});



test("submission waits for confirmed creation, prevents duplicates, announces success and refreshes sent count", async () => {
  const submission = createShareSubmission();
  let release; let posts = 0; let lists = 0; let closes = 0;
  apiClient.defaults.adapter = async (config) => {
    if (config.method === "post") {
      posts++;
      return new Promise((resolve) => { release = () => resolve(response(config, share, 201)); });
    }
    assert.equal(config.url, "/api/shares/sent"); lists++;
    return response(config, page([sentShare]));
  };
  const success = (email) => { closes++; submission.cancel(); sharingState.shared(email); };
  const pending = submission.submit(share.imageId, " RECIPIENT@EXAMPLE.COM ", success);
  await settle();
  assert.equal(submission.getSnapshot().pending, true);
  assert.equal(closes, 0); assert.equal(sharingState.getSnapshot().toast, "");
  await submission.submit(share.imageId, "recipient@example.com", success);
  assert.equal(posts, 1);
  release(); await pending; await settle();
  assert.equal(closes, 1); assert.equal(lists, 1);
  assert.deepEqual(submission.getSnapshot(), { pending: false, error: "" });
  assert.equal(sharingState.getSnapshot().sent.data.total, 1);
  assert.equal(sharingState.getSnapshot().toast, "Image shared with recipient@example.com.");
  assert.match(render(SharingSession), /role="status" aria-live="polite" aria-atomic="true"/);
  const revision = sharingState.getSnapshot().toastRevision;
  sharingState.shared("recipient@example.com"); await settle();
  assert.equal(sharingState.getSnapshot().toastRevision, revision + 1);
});

test("confirmed duplicate and other failures keep submission usable, never close or retry automatically", async () => {
  const submission = createShareSubmission();
  let requests = 0; let closes = 0;
  for (const [status, message, expected] of [
    [409, "An active share already exists for this image and recipient", "This image is already shared with this recipient."],
    [409, "A different conflict", "Could not complete the request."],
    [404, "Recipient not found", "No registered account uses that email address."],
    [500, "private details", "Could not complete the request."],
  ]) {
    const before = requests;
    apiClient.defaults.adapter = async (config) => { requests++; throw httpError(config, status, message); };
    await submission.submit(share.imageId, "recipient@example.com", () => closes++);
    await settle();
    assert.equal(requests, before + 1); assert.equal(closes, 0);
    assert.equal(submission.getSnapshot().pending, false);
    assert.ok(submission.getSnapshot().error.startsWith(expected));
    assert.equal(sharingState.getSnapshot().toast, "");
  }
  submission.cancel();
  assert.deepEqual(submission.getSnapshot(), { pending: false, error: "" });
  assert.deepEqual(createShareSubmission().getSnapshot(), { pending: false, error: "" });
});

test("closing then opening another dialog isolates late success from the new submission", async () => {
  const releases = [];
  apiClient.defaults.adapter = async (config) => new Promise((resolve) => {
    const { imageId } = JSON.parse(config.data);
    releases.push(() => resolve(response(config, { ...share, imageId }, 201)));
  });
  const previous = createShareSubmission(); const reopened = createShareSubmission();
  let oldCloses = 0; let newCloses = 0;
  const oldRequest = previous.submit(share.imageId, "recipient@example.com", () => oldCloses++);
  await settle(); previous.cancel();
  const newRequest = reopened.submit(ids[6], "another@example.com", () => newCloses++);
  await settle(); releases[0](); await oldRequest;
  assert.equal(oldCloses, 0); assert.equal(newCloses, 0);
  assert.deepEqual(reopened.getSnapshot(), { pending: true, error: "" });
  releases[1](); await newRequest;
  assert.equal(newCloses, 1); assert.equal(reopened.getSnapshot().pending, false);
});

test("malformed success response cannot close the dialog or produce a success toast", async () => {
  apiClient.defaults.adapter = async (config) => response(config, { ...share, imageId: ids[6] }, 201);
  const submission = createShareSubmission();
  let closes = 0;
  await submission.submit(share.imageId, "recipient@example.com", () => closes++);
  assert.equal(closes, 0); assert.match(submission.getSnapshot().error, /incomplete sharing/);
});

const ownedPreview = { ...image, originalName: "photo.JPG", originalSize: 100, isFavorite: false, originalImageId: ids[6] };
test("sent preview requests the exact owned version via the JWT API client, with no original or share lookup", async () => {
  const calls = [];
  apiClient.defaults.adapter = async (config) => {
    calls.push(config.url);
    assert.equal(config.headers.get("Authorization"), "Bearer test-session-token");
    return response(config, ownedPreview);
  };
  const loaded = await getImageById(share.imageId, signal());
  assert.deepEqual(calls, [`/api/images/${share.imageId}`]);
  assert.equal(loaded.url, image.url);
  const markup = render(ResolvedPreview, { image: loaded, filename: sentShare.image.filename });
  assert.match(markup, /alt="photo.webp"/); assert.match(markup, /object-contain/);
  assert.match(markup, /referrerPolicy="no-referrer"/i); assert.match(markup, /image-skeleton/);
  assert.match(markup, /src="https:\/\/storage.example.test\/photo.webp/);
});

test("sent previews show loading, expiry and unsafe-URL placeholders without losing share details", async () => {
  assert.match(render(SentSharePreview, { imageId: share.imageId, filename: "photo.webp" }), /Loading preview…/);
  for (const changed of [{ urlExpiresAt: "2000-01-01T00:00:00Z" }, { url: "javascript:bad" }, { url: undefined }]) {
    const markup = render(ResolvedPreview, { image: { ...ownedPreview, ...changed }, filename: "photo.webp" });
    assert.match(markup, /Refresh preview/); assert.doesNotMatch(markup, /<img/);
  }
  await sharingState.sent.refresh();
  const card = render(ShareHistory, { view: "sent", selectedShareId: null });
  assert.match(card, /h-56/); assert.match(card, /Loading preview…/);
  assert.match(card, /photo.webp/); assert.match(card, /recipient@example.com/); assert.match(card, /Revoke share/);
  const dialog = render(ShareImageDialog, { image: ownedPreview, returnFocus: {}, onClose() {} });
  assert.match(dialog, /value=""/); assert.match(dialog, /href="\/images\?view=sent"/);
  assert.match(dialog, /overflow-y-auto/); assert.match(dialog, /h-fit/);
  assert.doesNotMatch(dialog, /Shared with|>Shared<|disabled=""/);
});


const manyShares = (view, count = 23) => Array.from({ length: count }, (_, index) => ({
  ...(view === "sent" ? sentShare : share), _id: (1000 + index).toString(16).padStart(24, "0"),
  imageId: (2000 + index).toString(16).padStart(24, "0"),
}));
function serveShares(records, calls = []) {
  apiClient.defaults.adapter = async (config) => {
    const view = config.url.endsWith("/sent") ? "sent" : "received";
    const { page: requested, limit } = config.params;
    calls.push({ view, page: requested, limit });
    const items = records[view];
    return response(config, page(items.slice((requested - 1) * limit, requested * limit), requested, limit, items.length));
  };
}

test("both share tabs load 23 records as 10/10/3, guard observer bursts, and stop at totalPages", async () => {
  const calls = []; const records = { received: manyShares("received"), sent: manyShares("sent") };
  serveShares(records, calls);
  const store = createSharingState();
  for (const view of ["received", "sent"]) {
    const list = store[view];
    list.activate(); list.deactivate(); list.activate(); // Strict Mode setup/cleanup/setup
    await settle();
    assert.equal(store.getSnapshot()[view].data.items.length, 10);
    assert.deepEqual(calls.filter((call) => call.view === view), [{ view, page: 1, limit: 10 }]);
    const second = list.loadMore(); void list.loadMore(); void list.loadMore();
    assert.equal(store.getSnapshot()[view].loading, true);
    assert.equal(store.getSnapshot()[view].data.items.length, 10);
    await second;
    assert.equal(store.getSnapshot()[view].data.items.length, 20);
    await list.loadMore(); await list.loadMore();
    const snapshot = store.getSnapshot()[view];
    assert.equal(snapshot.data.items.length, 23); assert.equal(snapshot.data.total, 23);
    assert.equal(new Set(snapshot.data.items.map((item) => item._id)).size, 23);
    assert.equal(snapshot.hasMore, false); assert.equal(snapshot.page, 3);
    assert.deepEqual(calls.filter((call) => call.view === view).map((call) => call.page), [1, 2, 3]);
    list.deactivate();
  }
  assert.equal(store.getSnapshot().received.data.items.length, 23);
  assert.equal(store.getSnapshot().sent.data.items.length, 23);
  store.reset();
});

test("next-page failure keeps cards and offsets, blocks automatic retries, and Retry appends the failed batch", async () => {
  for (const view of ["received", "sent"]) {
    const records = { received: manyShares("received"), sent: manyShares("sent") };
    const store = createSharingState(); serveShares(records);
    store[view].activate(); await settle();
    let failures = 0;
    apiClient.defaults.adapter = async (config) => { failures++; throw httpError(config, 500, "internal"); };
    await store[view].loadMore(); await store[view].loadMore();
    const failed = store.getSnapshot()[view];
    assert.equal(failures, 1); assert.equal(failed.data.items.length, 10); assert.equal(failed.page, 1); assert.ok(failed.error);
    const retryCalls = []; serveShares(records, retryCalls);
    await store[view].retry();
    assert.equal(store.getSnapshot()[view].data.items.length, 20);
    assert.deepEqual(retryCalls, [{ view, page: 2, limit: 10 }]);
    store.reset();
  }
});

test("tab switching aborts old pages, retains independent collections, and ignores late responses", async () => {
  const store = createSharingState();
  const records = { received: manyShares("received"), sent: manyShares("sent") };
  serveShares(records); store.received.activate(); await settle();
  let release; let oldSignal;
  apiClient.defaults.adapter = async (config) => { oldSignal = config.signal; return new Promise((resolve) => {
    release = () => resolve(response(config, page(records.received.slice(10, 20), 2, 10, 23)));
  }); };
  const previous = store.received.loadMore(); await settle();
  store.received.deactivate(); assert.equal(oldSignal.aborted, true);
  serveShares(records); store.sent.activate(); await settle();
  release(); await previous;
  assert.equal(store.getSnapshot().received.data.items.length, 10);
  assert.equal(store.getSnapshot().sent.data.items.length, 10);
  store.sent.deactivate(); store.received.activate(); await settle();
  await store.received.loadMore();
  assert.equal(store.getSnapshot().received.data.items.length, 20);
  assert.equal(store.getSnapshot().sent.page, 1);
  store.reset();
});

test("count changes and overlapping offset pages require a reset instead of skipping or duplicating shares", async () => {
  for (const change of ["count", "overlap"]) {
    const records = { received: manyShares("received"), sent: manyShares("sent") };
    const store = createSharingState(); serveShares(records);
    store.received.activate(); await settle();
    apiClient.defaults.adapter = async (config) => response(config, page(
      change === "overlap" ? records.received.slice(9, 19) : records.received.slice(10, 20), 2, 10, change === "count" ? 24 : 23));
    await store.received.loadMore();
    assert.equal(store.getSnapshot().received.data.items.length, 10);
    assert.match(store.getSnapshot().received.error, /shares changed/);
    const calls = []; serveShares(records, calls);
    await store.received.retry();
    assert.deepEqual(calls, [{ view: "received", page: 1, limit: 10 }]);
    assert.equal(store.getSnapshot().received.data.items.length, 10);
    await store.received.loadMore();
    assert.equal(store.getSnapshot().received.data.items.length, 20);
    store.reset();
  }
});

test("refresh bursts cancel pending appends, reload only page one, and discard stale responses", async () => {
  const records = { received: manyShares("received"), sent: manyShares("sent") };
  const store = createSharingState(); serveShares(records);
  store.sent.activate(); await settle(); await store.sent.loadMore();
  let release;
  apiClient.defaults.adapter = async (config) => new Promise((resolve) => {
    release = () => resolve(response(config, page(records.sent.slice(20), 3, 10, 23)));
  });
  const old = store.sent.loadMore(); await settle();
  const calls = []; serveShares(records, calls);
  await Promise.all([store.sent.refresh(), store.sent.refresh(), store.sent.refresh()]);
  release(); await old;
  assert.deepEqual(calls, [{ view: "sent", page: 1, limit: 10 }]);
  assert.equal(store.getSnapshot().sent.data.items.length, 10);
  assert.equal(store.getSnapshot().sent.page, 1);
  store.reset();
});

test("creation, revocation refresh, socket updates and reconnect restart accumulated share offsets", async () => {
  const records = { received: manyShares("received"), sent: manyShares("sent") };
  const store = createSharingState(); serveShares(records);
  store.sent.activate(); store.received.activate(); await settle();
  await store.sent.loadMore(); await store.received.loadMore();
  records.sent.unshift({ ...sentShare });
  store.shared("recipient@example.com"); await settle();
  assert.equal(store.getSnapshot().sent.page, 1); assert.equal(store.getSnapshot().sent.data.total, 24);
  assert.equal(store.getSnapshot().sent.data.items[0]._id, sentShare._id);
  await store.sent.loadMore();
  records.sent[0] = { ...records.sent[0], revokedAt: share.createdAt, available: false };
  await store.sent.refresh();
  assert.equal(store.getSnapshot().sent.page, 1); assert.equal(store.getSnapshot().sent.data.items[0].available, false);
  records.received.unshift({ ...share });
  const sharesAdapter = apiClient.defaults.adapter;
  apiClient.defaults.adapter = async (config) => {
    if (config.url === "/api/notifications") return response(config, page([notification]));
    if (config.url === "/api/notifications/unread-count") return response(config, { unreadCount: 1 });
    return sharesAdapter(config);
  };
  store.notify(notification._id); store.notify(notification._id); await settle();
  assert.equal(store.getSnapshot().received.page, 1); assert.equal(store.getSnapshot().received.data.total, 24);
  await store.received.loadMore(); store.recover(); await settle();
  assert.equal(store.getSnapshot().received.page, 1);
  assert.equal(store.getSnapshot().received.data.items.length, 10);
  assert.equal(store.getSnapshot().sent.page, 1);
  store.reset();
});

test("share view renders loaded versus total counts, bottom loading/retry/end states and no pagination", async () => {
  const records = { received: manyShares("received"), sent: manyShares("sent") };
  for (const view of ["received", "sent"]) {
    serveShares(records); sharingState[view].activate(); await settle();
    let markup = render(ShareHistory, { view, selectedShareId: null });
    assert.match(markup, new RegExp(`Showing 10 of 23 ${view} shares`));
    assert.match(markup, /Load more shares/); assert.doesNotMatch(markup, /Next|Previous|Page 1/);
    let release;
    apiClient.defaults.adapter = async (config) => new Promise((resolve) => { release = () => resolve(response(config, page(records[view].slice(10, 20), 2, 10, 23))); });
    const more = sharingState[view].loadMore(); await settle();
    markup = render(ShareHistory, { view, selectedShareId: null });
    assert.match(markup, /Loading more shares/); assert.match(markup, /Showing 10 of 23/);
    release(); await more;
    apiClient.defaults.adapter = async (config) => { throw httpError(config, 500, "failure"); };
    await sharingState[view].loadMore();
    markup = render(ShareHistory, { view, selectedShareId: null });
    assert.match(markup, /Showing 20 of 23/); assert.match(markup, /Retry/); assert.doesNotMatch(markup, /Load more shares/);
    serveShares(records); await sharingState[view].retry();
    markup = render(ShareHistory, { view, selectedShareId: null });
    assert.match(markup, /Showing 23 of 23/); assert.match(markup, /reached the end of your shares/);
    sharingState[view].deactivate();
  }
  serveShares({ received: [], sent: [] });
  await sharingState.sent.refresh();
  const empty = render(ShareHistory, { view: "sent", selectedShareId: null });
  assert.match(empty, /haven’t shared any images yet/); assert.doesNotMatch(empty, /reached the end|Load more shares/);
});


test("received cards use the share creation timestamp and do not invent sender emails", async () => {
  const sharedAt = "2026-09-15T09:10:00Z";
  const receivedShare = { ...share, createdAt: sharedAt };
  apiClient.defaults.adapter = async (config) => response(config, page([receivedShare]));
  for (const reset of [() => {}, () => sharingState.reset(), () => { tokenStorage.clearToken(); tokenStorage.setToken("new-received-session"); }]) {
    reset(); await sharingState.received.refresh();
    const markup = render(ShareHistory, { view: "received", selectedShareId: null });
    assert.match(markup, /Shared by: Email unavailable/);
    assert.match(markup, /Shared on: <time dateTime="2026-09-15T09:10:00Z"/);
    assert.doesNotMatch(markup, /owner@example.test|recipient@example.com/);
    const selected = render(ShareHistory, { view: "received", selectedShareId: share._id });
    assert.equal((selected.match(/Shared on:/g) ?? []).length, 1);
    assert.match(selected, /dateTime="2026-09-15T09:10:00Z"/);
  }
});

test("unavailable received shares retain their dates and a missing sender email cannot break the list", async () => {
  const unavailable = { ...share, revokedAt: share.updatedAt, available: false };
  apiClient.defaults.adapter = async (config) => response(config, page([unavailable, { ...share, _id: ids[6] }]));
  await sharingState.received.refresh();
  const markup = render(ShareHistory, { view: "received", selectedShareId: null });
  assert.equal((markup.match(/Shared by: Email unavailable/g) ?? []).length, 2);
  assert.equal((markup.match(/Shared on: <time/g) ?? []).length, 2);
  assert.match(markup, /This share is unavailable/);
  assert.match(markup, /Download/);
  assert.doesNotMatch(markup, /Shared by: Account deleted/);
});

test("notification detail provides the share timestamp independently of image upload metadata", async () => {
  const detail = { share, image: { ...image, createdAt: "2010-01-01T00:00:00Z" } };
  const calls = [];
  apiClient.defaults.adapter = async (config) => { calls.push(config.url); return response(config, detail); };
  const access = await api.getSharedAccess(share._id, signal());
  assert.equal(access.share.createdAt, share.createdAt);
  assert.equal(access.share.senderId, share.senderId);
  assert.equal(access.share.sender, undefined);
  assert.deepEqual(calls, [`/api/shares/${share._id}`]);
  const markup = render(ReceivedShareCard, { shareId: share._id, share: access.share, revision: 0, selected: true });
  assert.match(markup, /dateTime="2026-09-30T12:00:00Z"/);
  assert.doesNotMatch(markup, /2010|owner@example.test/);
  assert.match(markup, /wrap-anywhere text-xs leading-relaxed/);
  const mismatched = render(ReceivedShareCard, { shareId: ids[6], share: access.share, available: false, revision: 0 });
  assert.doesNotMatch(mismatched, /<time/);
});
