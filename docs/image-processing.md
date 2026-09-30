# Image processing

Verified read-only against the local `image-processing-service` backend at commit
`f15cf869b353d2176611c5cc91cd8fac9df15260`. Sources: `src/images/images.controller.ts`,
`images.service.ts`, `dto/transform-image.dto.ts`, `dto/image-response.dto.ts`,
`schemas/image.schema.ts`, `src/s3/s3.service.ts`, `src/app.config.ts`, the image
controller/service and S3 tests, and `test/backend-http.test.cjs`.
The backend was not modified or run. A deployed backend must expose this version's contract.

## Verified requests

The existing Axios client uses the origin-only `VITE_API_URL`. Each API method
includes `/api` exactly once. Its request interceptor attaches the current Bearer
token; its existing 401 handling invalidates rejected sessions.

Processing is **two separate authenticated requests**, not transformations passed
to the multipart upload endpoint:

1. `POST /api/images/upload` with multipart `FormData` containing exactly one
   field, **`file`**, holding the original `File`. The browser generates the
   Content-Type and boundary. No transformation fields or query options are sent.
   The backend preserves original bytes and returns an original record (201).
2. `POST /api/images/{original._id}/transform` with JSON, for example:

   ```json
   {
     "transformations": {
       "resize": { "width": 800, "height": 600 },
       "quality": 80,
       "format": "webp"
     }
   }
   ```

   Empty dimensions are omitted, including the entire `resize` object when both
   are empty. Quality and format are sent only when **Customize output** is on
   (initially on at quality 80 / WebP, preserving the original workspace behavior).
   JSON values are numbers, never multipart strings. A new transformed version
   is saved and returned (201); the original is preserved.

| Input | Exact backend rule |
| --- | --- |
| File | Required, one file in the `file` field |
| MIME | `image/jpeg`, `image/png`, `image/webp`, detected from bytes rather than the client filename/MIME |
| Size | Strictly **less than 5,242,880 bytes** (5 MiB); largest accepted size is 5,242,879 bytes |
| `transformations` | Required nonempty JSON object; unknown properties, nulls, and incorrect JSON types rejected |
| `transformations.resize` | Optional; if provided, at least width or height must be present |
| `resize.width` | Optional integer, 1–4000 inclusive |
| `resize.height` | Optional integer, 1–4000 inclusive |
| `transformations.crop` | Optional; when enabled, width and height are required integers, 1–4000 inclusive |
| `crop.x`, `crop.y` | Optional nonnegative safe integers, 0–9,007,199,254,740,991; each defaults to 0 |
| `transformations.rotate` | Optional finite JSON number, −360 to 360 inclusive; fractional degrees allowed |
| `transformations.flip` | Optional boolean; vertical flip |
| `transformations.mirror` | Optional boolean; horizontal mirror |
| `transformations.filters` | Optional nonempty object; accepts independent boolean `grayscale` and `sepia` fields |
| `transformations.quality` | Optional integer, 1–100 inclusive; defaults to 80 |
| `transformations.format` | Optional: exactly `jpeg`, `png`, or `webp`; defaults to `webp` |

One dimension preserves proportions. Both use Sharp's centered cover resize and
can crop the edges. No dimensions means no resize. PNG quality affects palette
quantization, and no encoding guarantees a smaller file. The backend does not
auto-apply EXIF orientation and processes only the first animation frame.

## Transformation editor

The existing editor exposes every supported transformation in five collapsible
sections with visible activity summaries. Resize and Output start expanded. On
desktop the original preview stays alongside the controls; on smaller screens
the sections stack. The preview remains the **original image** until the backend
returns a processed result. No local Sharp processing or simulated result is used.

- **Resize:** optional width/height inputs. A single dimension is supported; an
  empty pair omits `resize`, with no invented dimensions or implicit resize.
- **Crop:** After selecting an image, Enable crop opens a `react-image-crop`
  editor with a centered selection. Users can draw, move, and resize the rectangle
  with mouse/touch or keyboard, or edit the synchronized pixel fields.
  **Coordinates refer to the original image**, before resizing or rotation.
  The rendered selection uses percentages, converted by rounding its edges
  against the original decoded width/height; resizing the viewport never changes
  the request coordinates. Drawn selections are clamped to the original bounds
  and the 4000-pixel width/height limit. Invalid typed values are rejected before
  upload. Reset crop restores the centered selection; disabling retains values
  but omits the operation. Replacing the file resets the crop to the new bounds,
  while removal clears and disables it. Changing resize or rotation never changes
  crop coordinates. Blank offsets still default to zero.

  The editor stays within the control column and caps the preview at 352 CSS
  pixels tall while preserving its aspect ratio. There is no letterboxed area
  inside the cropper's measurement surface. Selection borders do not animate;
  focus indicators and touch handles use the archival palette.
- **Orientation:** numeric rotation with fractional/negative angles and 90°,
  180°, 270° quick actions. Clicking an active quick action or Clear removes
  rotation. Empty and zero angles are omitted. Flip vertically and Mirror
  horizontally are independent toggles; inactive flags are omitted.
- **Filters:** independent grayscale/sepia toggles. When both are off, the entire
  filters object is omitted. When both are on, the backend applies grayscale first.
- **Output:** quality slider (1–100) with a visible number, plus WebP/JPEG/PNG
  selection. Customize output is initially on. Turning it off omits both fields
  and delegates to backend defaults (WebP, quality 80), without changing the other
  operations. Values remain available when custom output is enabled again.

The existing `buildTransformRequest()` is the single payload builder. It converts
active numeric inputs to JSON numbers and validates their limits. Inactive crop,
flip, mirror, filters, output, and zero/empty rotation are omitted; it never emits
nulls or empty nested objects. An entirely inactive recipe is rejected locally
because the backend requires a nonempty `transformations` object. With custom
output off and only rotation/grayscale active, the exact request is:

```json
{"transformations":{"rotate":90,"filters":{"grayscale":true}}}
```

A full request exercising all supported operations is:

```json
{
  "transformations": {
    "crop": { "width": 1000, "height": 800, "x": 100, "y": 50 },
    "resize": { "width": 800, "height": 600 },
    "flip": true,
    "mirror": true,
    "rotate": 90,
    "quality": 80,
    "format": "webp",
    "filters": { "grayscale": true, "sepia": true }
  }
}
```

That crop requires an original at least 1100 × 850 pixels. The fixed backend order
is **crop → resize → flip/mirror → rotate → grayscale → sepia → encode**. Object
property order does not change it. Positive angles rotate clockwise; arbitrary
angles expand the canvas with transparent padding (black in JPEG).

**Reset transformations** restores the initial settings and clears editor errors
while retaining the selected file, local preview, and any confirmed uploaded
original. It does not delete saved images or touch authentication. **Process
another image** still resets the whole workspace. All editing/reset controls are
disabled during processing. Invalid numeric fields are revealed/focused even
inside collapsed sections, and request validation still runs before uploading.

## Exact successful response

Both POSTs return a **flat JSON image object**, not `{ image: ... }` or `{ data: ... }`.
The service returns image metadata, caller-specific favorite state, and temporary
access links. Object IDs serialize as strings. Storage keys are omitted. The current original response contains:

```ts
{
  _id: string;
  kind: "original";
  user: string;
  originalName: string;
  filename: string;       // generated UUID filename
  isFavorite: boolean;    // caller-specific; false for new uploads and versions
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  format: "jpeg" | "png" | "webp";
  originalSize: number;   // bytes
  createdAt: string;
  updatedAt: string;
  url: string;
  downloadUrl: string;
  urlExpiresAt: string;
}
```

The transform response contains those common fields, with `kind: "transformed"`,
output `filename`, `mimeType`, and `format`. Storage keys are not exposed. It also contains:

```ts
{
  originalImageId: string;
  width: number;          // actual output pixels
  height: number;
  quality: number;
  processedSize: number;  // bytes
  transformations: {
    resize?: { width?: number; height?: number };
    crop?: { width: number; height: number; x: number; y: number };
    rotate?: number;
    flip?: boolean;
    mirror?: boolean;
    filters?: { grayscale?: boolean; sepia?: boolean };
    quality: number;
    format: "jpeg" | "png" | "webp";
  };
}
```

`transformations` contains the applied operations, with resolved quality/format
and crop offset defaults. `originalImageId`, `originalName`, and `originalSize`
refer to the preserved original. Originals omit `originalImageId`, dimensions,
quality, processedSize, and transformations.

The frontend validates response IDs, kind, file metadata, sizes, and processed
dimensions before accepting success. It consumes `_id`, `originalImageId`,
`kind`, `originalName`, `filename`, `isFavorite`, `format`, `originalSize`, `width`,
`height`, `quality`, `processedSize`, `transformations`, and the three access-link fields. Unused
owner/storage metadata is not displayed. Missing access links degrade to metadata
and a refresh action; malformed required metadata produces an error rather than
invented values.

Applied transformation metadata is checked against the DTO before use. The result
shows actual output dimensions, format, quality, and badges for the returned crop,
resize, orientation, and filters. It never echoes unsaved editor settings as an
applied result. False flags and zero rotation receive no active badge. Historical
records without `transformations` retain the metadata/result view without
inventing an operation history.

## Display and download filenames

`src/utils/imageFilename.ts` derives user-facing names from each returned record.
Originals retain `originalName` exactly. Transformed versions preserve its basename
and replace only the last extension with the actual `format` (`jpeg` → `.jpg`,
`png` → `.png`, `webp` → `.webp`). Uppercase source extensions, multiple dots, and
extensionless names are supported. Legacy names remain unchanged because their
original/version identity is unavailable. Studio's source-original label still
shows the unchanged original name. Cards, version lists, results, accessible
labels, delete dialogs, and download hints share this helper.

The local backend filename fix mirrors this rule in `images/image-filename.ts`.
`ImagesService.withAccessUrls` passes the derived name to `S3Service.getFileUrls`,
which signs `ResponseContentDisposition` as `attachment` with an ASCII `filename`
fallback and UTF-8 `filename*`. Thus a JPEG original named `photo.jpg` keeps that
name and its WebP version requests `photo.webp`. This applies to newly generated
links for existing records as well as new results, without changing `originalName`,
generated `filename`, S3 keys, records, or transformations.

Cross-origin S3 downloads use this server-provided header; the anchor's `download`
attribute is only a hint. Do not edit presigned query parameters in the frontend:
that would invalidate the signature. The backend change must be deployed and
links refreshed for the new names to take effect. Automated checks cover rendered
names, real JPEG-to-WebP encoding, and signed attachment overrides; they do not
verify a live browser download from S3.

## Preview and download

- `url` is an HTTPS presigned S3 GET URL with inline content disposition.
- `downloadUrl` uses attachment content disposition. Download links navigate
  directly to this URL; the app does not fetch S3 through the authenticated API client.
- `urlExpiresAt` is the maximum expiration timestamp, 900 seconds after signing.
  Credentials or bucket policies can expire access sooner.
- `GET /api/images/{versionId}` checks ownership and returns metadata with fresh
  access links. The result's Refresh image links action uses this endpoint.
- Responses no longer expose `path` or `originalKey`. The frontend uses only
  signed access URLs and `originalImageId` for original/version relationships.

Preview and download are supported by the verified backend contract. Live S3
access has not been verified: signing itself does not check object existence or
permissions. Failed previews show a fallback; expired links are hidden until
refreshed. Only absolute credential-free HTTPS links are used. The studio does
not fetch history; the gallery and dashboard use the list endpoint below.

## Image history and recent images

`GET /api/images?page=1&limit=10` uses the same authenticated Axios client and
returns a pagination envelope:

```ts
{
  items: ImageMetadata[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
```

Defaults are page 1 and limit 10; page must be an integer from 1–100000, and limit
from 1–50. The backend sorts by creation time descending, with ID as a tie-breaker.
Counts include individual original, transformed, and legacy **records**, not
logical groups. Counts and records are queried separately, so concurrent writes
can briefly make them inconsistent. The frontend validates the envelope, IDs,
metadata, and pagination without assuming every group fits on a page.

The All Images view requests page 1 with `limit=10`, then appends the next server
page when an IntersectionObserver sentinel comes within 240px below the viewport.
There is no whole-archive prefetch or local group pagination. Each batch contains
up to **10 records**, counting originals, transformed versions, and legacy images;
it can create fewer than 10 cards. The header distinguishes loaded records from
API `total` and separately reports the number of currently visible groups.
Loading stops when the returned `page >= totalPages` or the page is empty.

Records are deduplicated by `_id` and grouped after each batch. A later original
or version joins the existing group by ID without moving its position. Groups
may be incomplete until loading finishes; labels say that an original or versions
may still load, and disclosure counts reflect only loaded versions. There is no
endpoint for retrieving a complete version family independently.

Initial loading retains the existing skeleton cards. Subsequent requests keep
loaded cards visible with a small footer spinner. A later error preserves those
cards and displays an inline Retry button; observer callbacks cannot retry until
the user chooses Retry. Initial failures also require manual retry. Empty archives
retain the upload prompt; nonempty completed lists show a subtle end message.
Favorites keeps its original numbered-page workflow, and Dashboard is unchanged.

The loader follows the existing Axios, AbortController, and in-memory store
patterns, with one request at a time and a generation guard against stale results.
Deferred initial requests tolerate React Strict Mode setup/cleanup/setup without
duplicating transport. Observer cleanup ignores queued callbacks. Collection
changes and Refresh reset records and offsets; the hook's query key also scopes
any future server-supported filters/sort (currently the API exposes neither).

Deletion pauses/aborts pending batches before the mutation, then resets to page 1
after either success or an unconfirmed/partial failure. It never continues using
pre-deletion offsets, which could skip survivors after an original/version cascade.
A changed API total during scrolling preserves the loaded list but requires a
manual Retry from page 1. The API has no atomic snapshot; concurrent external
writes that leave the count unchanged cannot be fully detected. No backend change
is required for infinite scrolling. Existing records and transformation behavior
are unchanged.

`groupImagesByOriginal()` creates groups without mutating API data:

- Originals are identified by `kind: "original"` and `_id`.
- Versions with `kind: "transformed"` join by `originalImageId`, even if they
  precede their original in the newest-first response.
- A group's position follows its newest record. Versions preserve the
  API's order. Same filenames never establish a relationship.
- If an original is unavailable in the complete archive, its linked versions
  still form one labeled group. This is not caused by pagination.
- A transformed record without an original reference is displayed independently.
  Legacy records with no `kind` are labeled Legacy image and are not assigned
  invented original/version relationships.

Original cards emphasize the original and offer **View versions (N)** for loaded
versions, with more added as scrolling continues. Groups lacking their original emphasize the first version and
can expand the rest. Native disclosure controls support keyboard expansion.
Per-record details show available sizes, dimensions, quality, creation time,
expiry, and actual applied transformations. Missing original dimensions or
historical transformation metadata are not fabricated. Raw S3 keys are never
displayed as user-facing file information.

The dashboard now calls the same list API with `page=1&limit=4` and uses compact
previews of the latest four records, with a View all images link. This is explicitly
a recent-record view, not four distinct originals. It has its own honest loading,
empty, and retry states and does not duplicate the full gallery.

### Temporary gallery access links

`GET /api/images/{id}` returns a single owned record with fresh `url`,
`downloadUrl`, and `urlExpiresAt`. It supports originals, versions, and legacy
records. `getImageById` and the studio's existing `refreshImageLinks` name refer
to the same API implementation.

Gallery previews use only the response's HTTPS `url`. Failed/missing/expired
previews fall back independently, with a Refresh preview action. Links are
considered stale 30 seconds before expiry; missing/invalid expiry is treated
conservatively. A one-shot timer updates that local state but never makes a
background request. Refresh is on demand, with duplicate requests disabled and
abort cleanup when the card leaves the page. No URLs are persisted to storage.

Download uses `downloadUrl`. Before starting, it checks expiry again using the
current time and refreshes the record if necessary. It then follows the returned
URL directly; S3's signed attachment disposition initiates the download. No API
Bearer token is sent to S3, and no public bucket URL is constructed. Same-tab
attachment navigation avoids popup blockers after an asynchronous URL refresh.
AWS permissions or missing objects can still cause a signed link to fail; signing
does not verify object existence. Browser/S3 behavior requires live verification.

### Deleting records

`DELETE /api/images/{id}` returns HTTP 200 with:

```json
{ "message": "Image deleted successfully" }
```

The backend deletes a version alone, preserving its original and siblings.
Deleting an original cascades to **all owned versions**, including versions in
its collapsed disclosure. Legacy deletion affects only that legacy record. The frontend
sends one DELETE for the chosen ID; the backend owns cascade behavior.

A native modal dialog supplies keyboard focus containment and a clear per-kind
warning. Cancel is initially focused; Escape cancels before submission. While
pending, duplicate confirmation and dismissal are disabled and the gallery stays
visible. On confirmed success, the dialog closes and the current server page is
refetched. Empty pages above page 1 move to the previous valid page using the
returned totalPages (which also handles multi-page cascade deletions).

No record is optimistically removed before server confirmation. A failure keeps
the dialog and offers Cancel, retry, and Refresh gallery. Errors use the existing
normalizer with read/delete wording. Protected 401s still invoke global logout;
404, 429, server/storage, and network errors remain safe user-facing messages.
Deletion is not atomic across MongoDB/S3: a cascade can partially complete, and a
lost response may hide a completed deletion. Refreshing before retrying is advised
by the UI. There is no undo or backend idempotency mechanism.

## Errors and lifecycle

| Status | Meaning |
| --- | --- |
| 400 | Missing/unsupported/unexpected files; invalid nested settings; invalid Sharp operations; transforming a version ID |
| 401 | Missing, invalid, or expired JWT; existing global session handling applies |
| 404 | Invalid/missing ID or image owned by another account |
| 409 | Legacy image has no preserved original |
| 413 | File size at or above the 5 MiB exclusive limit |
| 422 | Stored original could not be decoded |
| 429 | Rate limit; upload and transform each allow 10 requests/minute per user; detail GET allows 60/minute |
| 500 | Database/unexpected server error |
| 502 | S3 read/write or access-link signing failure |

The UI maps errors to fixed useful messages without rendering arbitrary backend
details. The one recognized crop-bounds message is parsed with an anchored numeric
pattern and rewritten to explain the original dimensions and X/Y offsets. Other
400s use a generic validation message. Crop size, offset ranges, and original-image
bounds are checked locally; the backend remains authoritative. For the preview
only, EXIF metadata is removed from a temporary JPEG/PNG/WebP Blob so the browser
decodes the same unrotated pixel orientation as the backend. JPEG compressed scans,
PNG image chunks, and WebP image chunks are preserved; no canvas, crop, or pixel
re-encoding is performed. PNG metadata chunks include their own CRC; WebP's RIFF
size and EXIF-present flag are updated after removing its EXIF chunk. The decoded
preview dimensions can therefore be used for original-pixel crop coordinates.
The upload always uses the untouched original `File`, including its metadata.
Development diagnostics log only status and error code. Network/CORS
errors cannot reliably be distinguished in the browser. The backend now configures
CORS from `CORS_ORIGINS` and permits Content-Type/Authorization; deployment must
include the actual frontend origin.

Client validation checks exact size limits, supported file signatures, and browser
image decoding. Backend validation remains authoritative. The app never trusts
extensions or a spoofed MIME header alone. Object URLs are revoked on replacement,
removal, reset, unmount, decoding failure, or a superseded selection.

A synchronous request ref prevents duplicate processing/refresh submissions.
Controls are disabled during validation and requests. Request abort signals stop
the UI from applying late responses after navigation/unmount; cancellation cannot
undo server work already completed. A confirmed original is retained in page state
so processing retries do not upload it again. Reset clears page state and preview
without deleting saved images or changing authentication.

The two writes are not transactional or idempotent. A timeout, lost response, or
signing failure can occur after storage succeeds. Messages explain that retries
can create another copy/version. The frontend does not automatically retry writes.
All API calls allow up to 120 seconds for the free demo's backend startup. After
eight seconds a pending request shows an informational startup notice, without
canceling or retrying it. Failure leaves the selected image and transformation
settings in place; the submit action offers Retry even if the initial upload
failed. Confirmed uploaded originals are reused. Signed URLs, request tokens,
and image bytes are never logged by this page.

## Verification

```sh
npm run test:auth
npm run test:images
npm run lint
npm run build
git diff --check
```

Image tests use Axios adapters and synthetic/test image bytes; they never create
real accounts or write to S3. They cover limits/signatures, failed decoding and
object URL cleanup, multipart fields, nested JSON construction, response validation,
headers/401 handling, cancellation, signed-link refresh, safe errors, metadata,
missing/expired links, and honest size comparisons. Browser layout, drag/drop,
file-picker interaction, and live backend/S3 access still require a browser check.
The expanded suite keeps every original assertion and additionally covers each
operation alone, the full combined recipe, inactive/empty omission, crop and
rotation boundaries, independent/reset defaults, optional output, unchanged crop
coordinates after resizing, safe crop errors, and backend-sourced applied metadata.
History coverage adds pagination/query contracts, originals/versions/legacy
grouping, orphan versions, incremental family merging across API page boundaries,
loaded/total record counts, deletion offset resets, interrupted/failed batch loads,
Strict Mode setup/cleanup, duplicate requests/records, manual retry, stale responses,
immutable ordering, missing/expired URLs,
single-record refresh, confirmation semantics, deletion response failures,
server page correction, safe read/delete errors, and existing 401/cancellation
behavior. Dashboard auth assertions still verify the greeting and navigation;
their old placeholder assertions now require the real initial loading state.
Server-rendered dialog/gallery tests do not verify browser focus, downloads, or
live S3 access.

Visual crop coverage additionally verifies portrait/landscape percent-to-pixel
conversion, identical coordinates at mobile and desktop display sizes, edge
rounding, out-of-bounds selections, the 4000-pixel cap, manual bounds validation,
reset/replacement/disable behavior, metadata-neutral JPEG/PNG/WebP preview sources,
and byte-for-byte preservation of the uploaded original. For example, selecting
x=10%, y=25%, width=50%, height=50% on a 3000 × 2000 original produces
`crop: { x: 300, y: 500, width: 1500, height: 1000 }` even with resize and rotation
enabled. Dragging and responsive layout still require a connected browser for
visual verification.


## User-specific favorites

The Images page preserves complete original/version groups in All images. Favorites
uses `GET /api/images/favorites?page=1&limit=10` and displays individual records in
server order, with the endpoint's totals and page count. Switching views resets the
page. Successful removal refreshes the page and moves back if its last record was
removed. Empty collections do not show a page count.

Heart buttons use bodyless `PUT /api/images/:id/favorite` and
`DELETE /api/images/:id/favorite` through the authenticated client. State is
optimistic, shared by image ID, and rolled back on errors. Pending mutations block
duplicate clicks; stale reads cannot overwrite newer changes. State lives only in
memory, clears on token changes, and ignores earlier sessions. Fresh reads remain
authoritative. Rate limits respect Retry-After seconds or HTTP dates (60 seconds
when absent), with manual retry and no automatic mutation replay.


## Reprocessing saved originals

Verified read-only against local backend commit `e86defb`: `images.controller.ts`,
`images.service.ts`, `dto/image-response.dto.ts`, `dto/transform-image.dto.ts`, and
`s3/s3.service.ts`. No backend files were changed.

- `GET /api/images/:id` returns one owned image, including `kind`,
  `originalImageId` on versions, `originalName`, generated `filename`, `format`,
  sizes, `isFavorite`, and `url` / `downloadUrl` / `urlExpiresAt`.
- `POST /api/images/:originalId/transform` accepts the existing nested
  `{ transformations: { crop?, resize?, flip?, mirror?, rotate?, filters?, quality?, format? } }`
  JSON and saves a separate version. The backend rejects transformed IDs (400)
  and legacy originals without preserved bytes (409). Invalid, absent, or unowned
  images return 404; authentication expiry remains handled by the shared client.
- An original card links using its `_id`; a version uses `originalImageId`, the
  same relationship as archive grouping. No filename-based inference or fallback
  to the version ID is used. Records without an identifiable original show an
  unavailable explanation. Studio fetches and verifies `kind: "original"` before
  enabling processing, even when the query parameter was entered manually.

The durable source URL is `/upload?originalId=<id>`. The `/studio` alias preserves
its query string when redirecting. Refresh/direct navigation fetches the source
again. Account/source changes remount the workspace, abort metadata, preview and
processing work, and dispose object URLs. **Upload a new image** removes only
`originalId` and resets editor/result state.

Saved processing sends only the transform POST; it cannot enter the upload path.
New-file processing retains upload → transform and reuses a successful upload
when retrying a failed transform. Both paths use the same editor validation and
result component. Output `filename`, format, dimensions and size come from the
new response, with the source original's name separately labeled. New versions
are not automatically favorited. **View original and versions in Images** mounts
the existing archive loader, fetching and grouping fresh server data; there is
no persistent history cache to invalidate.

Original responses do not include pixel dimensions, and Sharp ignores EXIF
orientation. The saved preview therefore fetches the signed URL **for preview
only**, without credentials or API headers, and reuses the existing EXIF-removal
and decode helpers to obtain accurate crop coordinates. It never creates a File
or reuploads these bytes. Storage must permit browser CORS reads for this crop
preview. A failed or timed-out preview leaves non-crop processing available and
provides a manual retry that gets fresh signed links; it never retries in a loop.
Temporary preview Blob URLs are revoked on refresh, source changes, cancellation
and unmount. Result previews/downloads retain their signed-link refresh action.

Manual checks (requires a running backend, owned images and browser access):

- Open an original from Images, process, and confirm only a transform POST occurs.
- Open a version and confirm the URL targets its original, not the version.
- Refresh the saved Studio URL; verify the same source reloads.
- Try a missing/unowned ID or a version ID directly; processing stays disabled.
- Retry a failed preview; verify no request loop and crop remains unavailable until decoded.
- Switch to uploading; confirm the source parameter, old controls and result clear.
- Process a new file; verify upload then transform still works.
- Check the result's actual output filename/format and return to Images to see the
  version grouped under its source, without inheriting that source's favorite.
