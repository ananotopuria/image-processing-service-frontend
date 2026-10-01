# Frontend image sharing

Contract: [the backend handoff](image-sharing-handoff.md), updated for persisted
sent-share summaries. The frontend and backend source changes require deployment;
no deployment was performed.

## Integration

- Owned original and processed cards in History, including expanded versions and
  Favorites, expose Share. Each button supplies that exact image record's ID.
- The native accessible modal accepts an email, keeps keyboard focus inside,
  restores focus to its trigger, supports Escape/close, and locks background scroll.
- Confirmed share creation closes the dialog, announces “Image shared with
  {email}.” through the existing six-second live-region toast, and refreshes the
  Sent shares list/count from page one without navigation. Failed requests preserve the
  email; the confirmed duplicate 409 offers the existing `/images?view=sent` link.
  Closing a pending dialog aborts its request and prevents stale callbacks from
  closing a later dialog. Reopening starts with a fresh form.
- Sent cards fetch the exact `imageId` through owner-authorized
  `GET /api/images/:id`; sent-list summaries do not contain preview URLs. Cards
  keep metadata in component memory and reuse `LoadingImage` (including cached
  image handling/skeletons) and `useImageAccess` for expiry and manual refresh.
  Each retry/refresh performs at most one request, with no automatic retry loop.
  A missing image summary shows a placeholder; revoked shares can still show the
  owner's surviving image. Preview errors do not remove share details or actions.
- History retains All images infinite scrolling and Favorites pagination. Shared
  with me and Sent shares now independently accumulate the documented 1-based REST
  pages of 10 share records, including unavailable history. The existing All Images
  sentinel uses IntersectionObserver with a 240px bottom preload margin; no pages
  beyond the next batch are fetched ahead of scrolling. `page < totalPages` and a
  nonempty batch determine whether more records remain. Notifications retain their
  existing pagination controls.
- Each share tab retains its own records, total, last successful page, loading and
  errors. Switching tabs aborts pending requests; generation checks discard stale
  responses. Next-page failures preserve cards and require an explicit Retry.
  Totals say “Showing 10 of 23 sent shares”, distinct from the loaded count.
- Refresh shares, successful creation/revocation, and socket/focus/reconnect
  invalidation reset the relevant offsets and reload page one. Refresh bursts
  coalesce before transport. If an appended page has a changed total or overlaps
  loaded IDs, it is rejected with an explicit restart-on-Retry message. This follows
  All Images’ protection against changed server offsets. The backend has no
  pagination snapshot token; no new response fields or backend changes are needed.
- Received cards are deliberately separate from owner cards. They expose preview,
  download and access-link refresh only. They never request an owner image endpoint.
- `GET /api/shares/:shareId` supplies the filename and both temporary URLs.
  Downloads recheck access through this endpoint even before cached links expire.
  The signed S3 attachment header selects the filename; anchor `download` is only
  a hint. Detail 404 clears cached access and renders an unavailable state.
- The authenticated header reads persisted notifications and unread count from
  REST. Clicking a notification marks it read explicitly and opens
  `/images?view=received&shareId=...`, even when the share is outside the current
  list page. That destination survives login/registration.
- Socket.IO v4 uses `VITE_API_URL` (the existing backend **origin**), namespace
  `/notifications`, Engine.IO path `/socket.io`, and handshake `auth: { token }`.
  REST paths retain their `/api` prefix. No room or user identity is supplied.
- `SharingSession` owns one connection lifecycle at the authenticated app root.
  Listeners attach before connect; Strict Mode cleanup cancels scheduled connects.
  Logout/token replacement disconnects and clears in-memory account data,
  deduplication IDs, cooldowns, and pending requests.
- `notification.created` is only an invalidation hint, deduplicated by persistent
  notification ID. REST refreshes notifications, unread count and received shares;
  the UI shows a subtle dismissible toast. Every connect/reconnect and visible
  window focus recovers REST data. Sent shares also refresh if already loaded.
- `auth.expired` and `connect_error.data.code === "UNAUTHORIZED"` clear the current
  token through the existing authentication flow. Transport/origin failures leave
  REST available and show a connection notice. There is no refresh-token endpoint.
- All request paths honor Retry-After route cooldowns. Mutations never automatically
  retry. Requests and responses are scoped to the current session and stale
  responses cannot enter a replacement account.

No signed URLs, notification contents, or recipient emails are persisted by the
frontend. The only new runtime dependency is `socket.io-client` v4.

## Persisted sent-share details

The original HTTP response and `ShareResponseDto` omitted both recipient email
and image details. The previous frontend used temporary share-form labels, which
were lost on refresh. Sent shares now render required `recipientEmail` and
`image: { filename, format }` fields returned by `GET /api/shares/sent`, with no
local label cache. The backend resolves existing recipient/image IDs in batches
for the current page and derives filenames with the same helper as shared access.
No database migration, stored metadata change or additional dependency is needed.

Deleted users return `recipientEmail: null` ("Account deleted"); missing images or
images no longer owned by the sender return `image: null` ("Image unavailable").
Revoked history retains summaries when related records still exist. Existing
sender authorization, pagination and availability semantics remain unchanged.
Only the sent-list DTO is enriched; no private profile fields, storage keys or
signed URLs are exposed. Deploy the backend update before the frontend. Missing
fields from an old backend produce a retryable contract error rather than a
fabricated name or a misleading deleted-record fallback.

## Backend blocker: received sender identity

The inspected `SharingService.shareResponse`, received-list branch, received
access response, and `ShareResponseDto` expose `senderId` and `createdAt`, but no
sender email. The frontend now displays the share's creation date from the list
record or the detail response's `share` object. It keeps that metadata separate
from temporary image access so a failed link refresh does not erase the date.
It displays **Shared by: Email unavailable** while the API lacks sender details;
this is not evidence that the sender was deleted. Sender email display remains
incomplete. No private user directory or new lookup endpoint is queried, and no
email is taken from the logged-in account or the share form.

Required backend change (proposed, **not currently implemented**):

- For `GET /api/shares/received`, keep the existing recipient authorization,
  ID relationships, share dates, availability and pagination. Resolve the stored
  `senderId` values for the current page in one batch using the existing
  `UsersService.findEmailsByIds` projection of `_id email`.
- Add a required nullable `sender` to each received share: `{ "email":
  "sender@example.com" }`, or `null` when the sender no longer exists. Keep
  `senderId`; expose no other user profile fields or password data. A missing
  sender must not fail the list or its other shares. No database migration or
  stored email snapshot is needed.
- Include the same minimal object in `GET /api/shares/:id`'s `share` object after
  the existing recipient authorization. Notification links can open shares
  outside the loaded list, so enriching only the list would leave those cards
  without sender identity.
- Add received-specific response DTOs/Swagger schemas and update the backend
  handoff. Then extend the frontend received types/validators and replace the
  honest fallback with `sender.email`, using “Account deleted” only for explicit
  `sender: null`. Keep the wrapping typography already added to the sender row.

No backend changes were made for this request. The current handoff continues to
describe the existing API rather than claiming this proposed object is available.

## Verification and deployment limits

Run `npm run test:sharing`, `npm run test:images`, `npm run test:auth`,
`npm run test:pricing`, `npm run build`, and `npm run lint`.

Sharing tests use mocked authenticated REST transport, an event-emitter socket
substitute and server-rendered components. They cover endpoint/body/pagination
contracts, access isolation, error and Retry-After handling, mutation/session
races, notification recovery, socket settings/events/authentication failures,
account cleanup, exact-image share actions and read-only received markup.
UX regression checks cover confirmed-create callbacks/toasts/list counts,
blocked duplicate submissions, duplicate versus unrelated conflicts, late
responses after closing/reopening, owner-preview requests, and rendered preview
loading/expiry/unsafe-URL states. These are request/controller and server-rendered
checks, not interactive browser tests.
Infinite-share tests use 23 mocked records in each tab and verify 10/10/3 batches,
no upfront page loading, concurrent request guards, independent tab state, stale
response cancellation, retries, count/overlap changes, mutation/socket resets,
loaded-versus-total labels, and empty/end states. Actual browser scrolling with
more than 10 live shares remains a manual check: the in-app browser was unavailable.
They do not establish a live Socket.IO connection or download an S3 object.
Backend sharing integration tests additionally exercise real local HTTP/Socket.IO
and a temporary MongoDB replica set (S3 substituted), including sent-share
persistence across restart, filename formats, deletion fallbacks, authorization,
and generated Swagger schemas. These checks do not verify deployed endpoints.
The in-app browser was unavailable during implementation; visual layout, keyboard
interaction and a deployed two-account workflow still need manual verification.

Deployment must provide the supplied sharing backend, a transaction-capable
MongoDB deployment and permission to create required indexes. Existing exact
`CORS_ORIGINS` must include the frontend; proxies must forward `/api/*` and
`/socket.io/` including upgrades. Sign in again if an old JWT has no expiry.
Use one backend process as documented unless shared adapters/throttling and
polling affinity have been configured. These deployment settings were not verified.

Revocation prevents new signed URLs. Already-issued bearer URLs can remain usable
for up to 15 minutes; downloaded copies cannot be revoked. There is no revoke/read
socket event. Recipients recover availability on focus, refresh, or download.

## Two-account manual checklist

1. Sign in as A and B in separate browser profiles. In A's History, share one
   original and one processed WebP version with B's email. Check exact filenames;
   confirm a version share exposes neither the original nor its siblings.
2. In B, verify the bell count, one toast per share, and persisted notifications.
   Click a notification: it becomes read and opens that received image. Confirm
   preview/download work and no transform, delete, favorite or reshare action exists.
3. Try invalid email, an unregistered email, A's own email and the same active
   share twice. Confirm clear errors and no duplicate active share.
4. Revoke a sent share as A. Focus/refresh B or attempt another download: the share
   becomes unavailable. Delete an owner's image/version and repeat. Previously
   downloaded files or unexpired URLs may remain usable as described above.
5. Disconnect B, create another share as A, and reconnect B. Verify REST recovery
   supplies the notification/count/share without duplicate cards. Reload and check
   offline persistence. Reload A, then sign out and back in: Sent shares must still
   show B’s email and the correct filename. Check "1 sent share" for one record.
6. Create at least 23 shares. In each sharing tab, scroll near the bottom and
   verify batches of 10, 10, then 3, accurate loaded/total counts, and the end message.
   Switch tabs while a batch is pending; loaded cards must stay scoped to their tab.
   Fail a next-page request, verify cards remain, then Retry. Refresh after creation
   or revocation and check page-one restart without duplicates. Notifications retain
   pagination; All images still scrolls in batches of 10 with its existing actions.
7. Logout/switch accounts and verify no prior notifications, images or email labels
   remain. Expire a JWT and sign back in; a selected share link should be restored.
8. On desktop/mobile, use Tab/Shift+Tab and Escape in the share dialog, verify focus
   returns to Share and background scrolling is locked. Check the bell dropdown
   fits the viewport and closes with Escape or an outside click.

### Sharing UX manual checks

- Share successfully: the dialog closes, a short success toast appears, the page
  stays in place, and Sent shares shows the new record/count. Open Share again:
  the email and errors should be empty.
- Share the same image with the same recipient: the dialog remains open with the
  duplicate message and entered email. “View sent shares” closes it and selects
  that History tab. Other errors must not show success or retry automatically.
- Throttle the network, submit, close, and open Share for another image. Finishing
  the first request must not close or reset the new dialog.
- In Sent shares, compare an original and a processed version preview. Check a
  deleted image, failed storage response, expired URL/manual refresh, pagination,
  and revoked shares whose images still exist. Details and revoke controls remain
  available when a preview fails.
- On a narrow/short viewport (including with DevTools open), verify the compact
  modal, reachable close/actions, Tab wrapping, Escape, focus restoration and
  background scroll locking.
