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
   are empty. Quality and format are always explicitly sent from the controls.
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
| `transformations.quality` | Optional integer, 1–100 inclusive; defaults to 80 |
| `transformations.format` | Optional: exactly `jpeg`, `png`, or `webp`; defaults to `webp` |

One dimension preserves proportions. Both use Sharp's centered cover resize and
can crop the edges. No dimensions means no resize. PNG quality affects palette
quantization, and no encoding guarantees a smaller file. The backend does not
auto-apply EXIF orientation and processes only the first animation frame.

The backend also accepts crop, rotate, flip, mirror, and filters in its transform
DTO. This page intentionally implements only the requested resize/encoding controls.

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
    quality: number;
    format: "jpeg" | "png" | "webp";
  };
}
```

For this page's requests, `transformations` contains only the submitted resize
and encoding settings shown above. The backend includes other operations when
requested by other clients. `originalKey`, `originalName`, and `originalSize`
refer to the preserved original. Originals omit `originalImageId`, dimensions,
quality, processedSize, and transformations.

The frontend validates response IDs, kind, file metadata, sizes, and processed
dimensions before accepting success. It consumes `_id`, `originalImageId`,
`kind`, `originalName`, `filename`, `path`, `format`, `originalSize`, `width`,
`height`, `quality`, `processedSize`, and the three access-link fields. Unused
owner/storage metadata is not displayed. Missing access links degrade to metadata
and a refresh action; malformed required metadata produces an error rather than
invented values.

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
refreshed. Only absolute credential-free HTTPS links are used. No history/list
endpoint is called.

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
details. Development diagnostics log only status and error code. Network/CORS
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
Transform calls allow up to 120 seconds; other requests keep the client's 30-second
timeout. Signed URLs, request tokens, and image bytes are never logged by this page.

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
