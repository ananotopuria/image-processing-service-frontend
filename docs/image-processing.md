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
The service spreads the Mongoose record, then adds temporary access links. The
schema has timestamps and disables the Mongoose version key (`__v`). Object IDs
serialize as strings. The current original response contains:

```ts
{
  _id: string;
  kind: "original";
  user: string;
  originalName: string;
  filename: string;       // generated UUID filename
  path: string;           // originals/{userId}/{uuid}.{format}
  originalKey: string;    // same key as path on originals
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
output `filename`, `mimeType`, `format`, and a `path` of
`transformed/{userId}/{originalId}/{uuid}.{format}`. It also contains:

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
and crop offset defaults. `originalKey`, `originalName`, and `originalSize`
refer to the preserved original. Originals omit `originalImageId`, dimensions,
quality, processedSize, and transformations.

The frontend validates response IDs, kind, file metadata, sizes, and processed
dimensions before accepting success. It consumes `_id`, `originalImageId`,
`kind`, `originalName`, `filename`, `path`, `format`, `originalSize`, `width`,
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

## Preview and download

- `url` is an HTTPS presigned S3 GET URL with inline content disposition.
- `downloadUrl` uses attachment content disposition. Download links navigate
  directly to this URL; the app does not fetch S3 through the authenticated API client.
- `urlExpiresAt` is the maximum expiration timestamp, 900 seconds after signing.
  Credentials or bucket policies can expire access sooner.
- `GET /api/images/{versionId}` checks ownership and returns metadata with fresh
  access links. The result's Refresh image links action uses this endpoint.
- `path` and `originalKey` are **S3 object keys, never public URLs**. The frontend
  neither constructs bucket URLs nor exposes AWS credentials.

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

`/images` collects all archive metadata in API batches of 50, then groups records
before paginating. Each UI page has up to **10 complete image groups/cards**;
only the last page can have fewer. The footer's page count and visible range use
group totals. The header distinguishes image groups from saved record counts.
Previous/Next slice this complete collection locally, so API page boundaries
cannot separate versions from their original. Groups follow newest activity.

Manual Refresh, Retry, and deletion reload the archive. There is no polling.
Initial loading uses skeleton cards; refresh preserves the last complete archive
with an updating message. Failed refreshes mark it stale and disable navigation
and deletion until reloaded. Failed later batches never publish partial groups;
changed totals, duplicate IDs across batches, or incomplete batches require Retry.
The API has no atomic snapshot, so simultaneous changes cannot be fully excluded.
Aborted/stale responses cannot replace the collection. Deleting the last group on
a page clamps navigation to the last remaining page. Empty archives show an
Upload image link.

This frontend-only fix fetches metadata for the whole archive, which suits the
portfolio demo but increases initial load time and memory for large collections.
A backend endpoint that paginates originals with complete versions would be the
scalable replacement; the existing raw-record API and dashboard remain unchanged.

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

Original cards emphasize the original and offer **View versions (N)** for all
its versions. Groups lacking their original emphasize the first version and
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
grouping, orphan versions, complete groups across API page boundaries, group page
counts and ranges, deletion page clamping, interrupted/failed archive loads,
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
