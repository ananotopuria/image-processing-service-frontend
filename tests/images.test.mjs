import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { AxiosError, AxiosHeaders } from "axios";
import { createServer } from "vite";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";

const stored = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  },
  addEventListener() {},
};
process.env.VITE_API_URL = "https://api.example.test";
const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, logLevel: "error" });
const helpers = await vite.ssrLoadModule("/src/utils/images.ts");
const { imageFilename } = await vite.ssrLoadModule("/src/utils/imageFilename.ts");
const cropHelpers = await vite.ssrLoadModule("/src/utils/crop.ts");
const { imagePreviewSource } = await vite.ssrLoadModule("/src/utils/imagePreviewSource.ts");
const { createUploadFormData, uploadImage, transformImage, refreshImageLinks, getImageById, getImages, deleteImage, getFavoriteImages, setImageFavorite } = await vite.ssrLoadModule("/src/api/images.ts");
const { createInfiniteImageHistory } = await vite.ssrLoadModule("/src/utils/infiniteImageHistory.ts");
const { default: InfiniteImageLoader } = await vite.ssrLoadModule("/src/components/images/InfiniteImageLoader.tsx");
const history = await vite.ssrLoadModule("/src/utils/imageHistory.ts");
const { apiClient } = await vite.ssrLoadModule("/src/api/client.ts");
const { tokenStorage } = await vite.ssrLoadModule("/src/auth/tokenStorage.ts");
const { getImageErrorMessage } = await vite.ssrLoadModule("/src/api/imageErrors.ts");
const { default: ProcessingResult } = await vite.ssrLoadModule("/src/components/images/ProcessingResult.tsx");
const { default: ImageGroupCard } = await vite.ssrLoadModule("/src/components/images/ImageGroupCard.tsx");
const { default: DeleteImageDialog } = await vite.ssrLoadModule("/src/components/images/DeleteImageDialog.tsx");
const { createFavoriteState, favoriteState } = await vite.ssrLoadModule("/src/utils/favorites.ts");
const { toggleFavorite } = await vite.ssrLoadModule("/src/hooks/useFavorites.ts");
const { getRetryAfterDeadline } = await vite.ssrLoadModule("/src/api/imageErrors.ts");
const { default: FavoriteButton } = await vite.ssrLoadModule("/src/components/images/FavoriteButton.tsx");
const reprocessing = await vite.ssrLoadModule("/src/utils/reprocessing.ts");
const { getSavedOriginal } = await vite.ssrLoadModule("/src/api/images.ts");
const { processStudioSource } = await vite.ssrLoadModule("/src/api/studio.ts");
const { loadSavedImagePreview } = await vite.ssrLoadModule("/src/utils/savedImagePreview.ts");
const { default: Studio } = await vite.ssrLoadModule("/src/pages/Studio.tsx");
const { default: SavedOriginalPreview } = await vite.ssrLoadModule("/src/components/images/SavedOriginalPreview.tsx");

after(async () => { await vite.close(); delete globalThis.window; });
beforeEach(() => tokenStorage.clearToken());

const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=", "base64");
const png = () => new File([pngBytes], "photo.png", { type: "image/png" });
const original = {
  _id: "66e83a109af861ce27c86a02", user: "66e83a109af861ce27c86a01", kind: "original",
  originalName: "photo.png", filename: "original.png", format: "png", mimeType: "image/png",
  isFavorite: false, originalSize: 1000,
  url: "https://storage.example.test/original.png?signature=test",
  downloadUrl: "https://storage.example.test/original.png?attachment=test",
  urlExpiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z",
};
const processed = {
  ...original, _id: "66e83a109af861ce27c86a03", kind: "transformed", originalImageId: original._id,
  format: "webp", filename: "version.webp",
  width: 20, height: 10, quality: 80, processedSize: 400,
  url: "https://storage.example.test/version.webp?signature=test", downloadUrl: "https://storage.example.test/version.webp?attachment=test",
  transformations: { format: "webp", quality: 80 },
};
const signal = () => new AbortController().signal;
const response = (config, data, status = 201) => ({ config, data, status, statusText: "", headers: new AxiosHeaders() });
const httpError = (status, config = { headers: new AxiosHeaders() }) => new AxiosError("private transport details", undefined, config, undefined, response(config, { message: "database password: secret" }, status));

test("rejects unsupported, empty, and falsely labeled image bytes", async () => {
  for (const file of [
    new File(["<svg />"], "image.svg", { type: "image/svg+xml" }),
    new File(["not a PNG"], "fake.png", { type: "image/png" }),
    new File([], "empty.png", { type: "image/png" }),
  ]) await assert.rejects(helpers.validateImageFile(file), /image|empty/i);
});

test("detects JPEG, PNG, and WebP from bytes, independently of filename or MIME header", async () => {
  assert.equal(await helpers.validateImageFile(png()), "image/png");
  assert.equal(await helpers.validateImageFile(new File([pngBytes], "wrong.txt", { type: "text/plain" })), "image/png");
  assert.equal(await helpers.validateImageFile(new File([new Uint8Array([255, 216, 255, 224])], "photo.jpg")), "image/jpeg");
  assert.equal(await helpers.validateImageFile(new File(["RIFF0000WEBP"], "photo.webp")), "image/webp");
});

test("enforces the backend's exclusive 5 MiB limit", async () => {
  const max = helpers.MAX_IMAGE_BYTES;
  for (const size of [max, max + 1]) {
    await assert.rejects(helpers.validateImageFile(new File([pngBytes, new Uint8Array(size - pngBytes.length)], "large.png")), /smaller than 5 MiB/);
  }
  assert.equal(await helpers.validateImageFile(new File([pngBytes, new Uint8Array(max - 1 - pngBytes.length)], "limit.png")), "image/png");
});

test("rejects damaged images during preview decoding and revokes their object URLs", async () => {
  const originalImage = globalThis.Image;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  URL.createObjectURL = () => "blob:test-preview";
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.Image = class { async decode() { throw new Error("Bad pixels"); } };
  try {
    await assert.rejects(helpers.prepareImagePreview(png()), /may be damaged/);
    assert.deepEqual(revoked, ["blob:test-preview"]);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    if (originalImage) globalThis.Image = originalImage; else delete globalThis.Image;
  }
});

test("upload FormData contains only the file; transformation fields never go into multipart", async () => {
  const file = png();
  const form = await createUploadFormData(file);
  assert.deepEqual([...form.keys()], ["file"]);
  assert.equal(form.get("file").name, "photo.png");
  assert.deepEqual(Buffer.from(await form.get("file").arrayBuffer()), pngBytes);
});

test("omits empty dimensions and sends actual JSON numbers under transformations.resize", () => {
  const base = helpers.DEFAULT_SETTINGS;
  assert.deepEqual(helpers.buildTransformRequest(base), { transformations: { quality: 80, format: "webp" } });
  assert.deepEqual(helpers.buildTransformRequest({ ...base, width: "800" }), { transformations: { resize: { width: 800 }, quality: 80, format: "webp" } });
  assert.deepEqual(helpers.buildTransformRequest({ ...base, height: "4000", format: "png", quality: 1 }), { transformations: { resize: { height: 4000 }, quality: 1, format: "png" } });
  assert.deepEqual(helpers.buildTransformRequest({ ...base, width: "1", height: "2", format: "jpeg", quality: 100 }), { transformations: { resize: { width: 1, height: 2 }, quality: 100, format: "jpeg" } });
});

test("rejects out-of-range, fractional, non-finite dimensions and encoding options", () => {
  for (const field of ["width", "height"]) for (const value of ["0", "-1", "4001", "2.5", "NaN", "Infinity", "abc"]) {
    assert.throws(() => helpers.buildTransformRequest({ ...helpers.DEFAULT_SETTINGS, [field]: value }), /whole number/);
  }
  for (const quality of [0, 101, 2.5, NaN, Infinity, "80"]) assert.throws(() => helpers.buildTransformRequest({ ...helpers.DEFAULT_SETTINGS, quality }), /Quality/);
  assert.throws(() => helpers.buildTransformRequest({ ...helpers.DEFAULT_SETTINGS, format: "gif" }), /output format/);
});

test("uploads then transforms through the existing authenticated API client with exact payloads", async () => {
  tokenStorage.setToken("image-test-token");
  const calls = [];
  const body = helpers.buildTransformRequest({ ...helpers.DEFAULT_SETTINGS, width: "20" });
  apiClient.defaults.adapter = async (config) => {
    calls.push(config.url);
    assert.equal(config.baseURL, "https://api.example.test");
    assert.equal(config.headers.get("Authorization"), "Bearer image-test-token");
    if (config.url === "/api/images/upload") {
      assert.ok(config.data instanceof FormData);
      assert.deepEqual([...config.data.keys()], ["file"]);
      assert.doesNotMatch(String(config.headers.get("Content-Type")), /boundary=/);
      return response(config, original);
    }
    assert.deepEqual(JSON.parse(config.data), body);
    assert.equal(config.headers.get("Content-Type"), "application/json");
    return response(config, processed);
  };
  const source = await uploadImage(png(), signal());
  assert.equal(source._id, original._id);
  const result = await transformImage(source._id, body, signal());
  assert.equal(result.processedSize, 400);
  assert.equal(result.url, processed.url);
  assert.deepEqual(calls, ["/api/images/upload", `/api/images/${original._id}/transform`]);
});

test("rejects invalid files before any upload transport", async () => {
  apiClient.defaults.adapter = async () => assert.fail("Invalid files must not be sent");
  await assert.rejects(uploadImage(new File(["invalid"], "fake.png"), signal()), /invalid image/);
});

test("rejects malformed success responses instead of inventing metadata or guessing IDs", async () => {
  for (const data of [null, {}, { ...original, _id: "wrong" }, { ...original, kind: "transformed" }, { ...original, originalSize: "1000" }]) {
    apiClient.defaults.adapter = async (config) => response(config, data);
    await assert.rejects(uploadImage(png(), signal()), /incomplete image details/);
  }
  for (const data of [{ ...processed, processedSize: undefined }, { ...processed, width: 0 }, { ...processed, originalImageId: processed._id }]) {
    apiClient.defaults.adapter = async (config) => response(config, data);
    await assert.rejects(transformImage(original._id, helpers.buildTransformRequest(helpers.DEFAULT_SETTINGS), signal()), /incomplete image details/);
  }
});

test("refreshes signed links using the version ID without re-uploading or transforming", async () => {
  apiClient.defaults.adapter = async (config) => {
    assert.equal(config.method, "get");
    assert.equal(config.url, `/api/images/${processed._id}`);
    return response(config, { ...processed, url: "https://storage.example.test/fresh?signature=test" });
  };
  assert.equal((await refreshImageLinks(processed._id, signal())).url, "https://storage.example.test/fresh?signature=test");
});

test("upload and transform 401s reuse the existing session invalidation interceptor", async () => {
  for (const request of [() => uploadImage(png(), signal()), () => transformImage(original._id, helpers.buildTransformRequest(helpers.DEFAULT_SETTINGS), signal())]) {
    tokenStorage.setToken("rejected-image-token");
    apiClient.defaults.adapter = async (config) => { throw httpError(401, config); };
    await assert.rejects(request());
    assert.equal(tokenStorage.getToken(), null);
  }
});

test("processing failures retain authentication and canceled requests do not reach transport", async () => {
  tokenStorage.setToken("valid-image-token");
  apiClient.defaults.adapter = async (config) => { throw httpError(422, config); };
  await assert.rejects(transformImage(original._id, helpers.buildTransformRequest(helpers.DEFAULT_SETTINGS), signal()));
  assert.equal(tokenStorage.getToken(), "valid-image-token");
  const controller = new AbortController();
  controller.abort();
  apiClient.defaults.adapter = async () => assert.fail("Canceled request reached transport");
  await assert.rejects(uploadImage(png(), controller.signal));
});

test("formats sizes and calculates real savings, including larger output", () => {
  assert.equal(helpers.formatFileSize(0), "0 B");
  assert.equal(helpers.formatFileSize(1024), "1.0 KiB");
  assert.equal(helpers.formatFileSize(1048576), "1.00 MiB");
  assert.equal(helpers.calculateSizeReduction(1000, 400), 60);
  assert.equal(helpers.calculateSizeReduction(1000, 1500), -50);
  for (const [a, b] of [[0, 10], [100, undefined], [NaN, 1], [100, Infinity], [100, -1]]) assert.equal(helpers.calculateSizeReduction(a, b), null);
});

test("never treats S3 object keys or unsafe schemes as browser image links", () => {
  for (const url of [undefined, "processed/file.webp", "/image.png", "javascript:alert(1)", "data:image/png;base64,x", "https://user:pass@example.test/file", "http://example.test/image"]) assert.equal(helpers.usableImageUrl(url), null);
  assert.equal(helpers.usableImageUrl(processed.url), processed.url);
});

test("result renders actual metadata, real links, larger-output wording, and missing-preview fallback", () => {
  const render = (image) => renderToStaticMarkup(createElement(ProcessingResult, { image, refreshing: false, onRefresh() {}, onReset() {} }));
  assert.match(render(processed), /Download image/);
  assert.match(render(processed), /60.0%/);
  assert.match(render({ ...processed, processedSize: 1500 }), /SIZE INCREASE/);
  const missing = render({ ...processed, url: undefined, downloadUrl: undefined });
  assert.match(missing, /preview is unavailable/);
  assert.match(missing, /400 B/);
  assert.doesNotMatch(missing, /Download image|<img/);
  const expired = render({ ...processed, urlExpiresAt: "2000-01-01T00:00:00Z" });
  assert.match(expired, /link has expired/);
  assert.doesNotMatch(expired, /Download image|<img/);
});

test("maps HTTP and network failures to safe messages without leaking backend internals", () => {
  for (const status of [400, 401, 404, 409, 413, 422, 429, 500, 502, 503]) {
    assert.doesNotMatch(getImageErrorMessage(httpError(status)), /password|secret|private transport/);
  }
  assert.match(getImageErrorMessage(httpError(413)), /5,242,880/);
  assert.match(getImageErrorMessage(httpError(422)), /decoded/);
  assert.match(getImageErrorMessage(httpError(429)), /Try again in 60 seconds/);
  assert.match(getImageErrorMessage(new AxiosError("private", "ERR_NETWORK")), /network or CORS/);
  assert.match(getImageErrorMessage(new AxiosError("private", "ECONNABORTED")), /may have been saved/);
});

// Disable explicit output to exercise the smallest operation-only requests.
function editorSettings(changes = {}) {
  return { ...helpers.createDefaultSettings(), outputEnabled: false, ...changes };
}

for (const [name, settings, expected] of [
  ["resize only", { width: "800" }, { resize: { width: 800 } }],
  ["height-only resize", { height: "600" }, { resize: { height: 600 } }],
  ["crop only", { cropEnabled: true, cropWidth: "500", cropHeight: "400", cropX: "10", cropY: "20" }, { crop: { width: 500, height: 400, x: 10, y: 20 } }],
  ["rotate only", { rotate: "90" }, { rotate: 90 }],
  ["flip only", { flip: true }, { flip: true }],
  ["mirror only", { mirror: true }, { mirror: true }],
  ["grayscale only", { grayscale: true }, { filters: { grayscale: true } }],
  ["sepia only", { sepia: true }, { filters: { sepia: true } }],
  ["both filters", { grayscale: true, sepia: true }, { filters: { grayscale: true, sepia: true } }],
  ["rotation with grayscale", { rotate: "90", grayscale: true }, { rotate: 90, filters: { grayscale: true } }],
]) {
  test(`builds the minimal payload for ${name}`, () => {
    assert.deepEqual(helpers.buildTransformRequest(editorSettings(settings)), { transformations: expected });
  });
}

test("builds a full request using exact backend fields, JSON numbers, and boolean flags", () => {
  const body = helpers.buildTransformRequest(editorSettings({
    cropEnabled: true, cropWidth: "1000", cropHeight: "800", cropX: "100", cropY: "50",
    width: "800", height: "600", rotate: "90", flip: true, mirror: true,
    grayscale: true, sepia: true, outputEnabled: true, quality: 80, format: "webp",
  }));
  assert.deepEqual(body, { transformations: {
    crop: { width: 1000, height: 800, x: 100, y: 50 },
    resize: { width: 800, height: 600 }, rotate: 90, flip: true, mirror: true,
    quality: 80, format: "webp", filters: { grayscale: true, sepia: true },
  } });
  assert.equal(helpers.isImageTransformations(body.transformations), true);
});

test("omits disabled crop, zero rotation, inactive booleans, empty resize, filters, and output", () => {
  const settings = editorSettings({
    cropEnabled: false, cropWidth: "bad", cropHeight: "-1", cropX: "NaN", cropY: "-20",
    width: "", height: " ", rotate: "0", flip: true, mirror: false, grayscale: false, sepia: false,
    quality: NaN, format: "gif",
  });
  assert.deepEqual(helpers.buildTransformRequest(settings), { transformations: { flip: true } });
  assert.deepEqual(helpers.buildTransformRequest({ ...settings, rotate: "-0" }), { transformations: { flip: true } });
});

test("does not mutate crop coordinates when resize settings change", () => {
  const settings = editorSettings({ cropEnabled: true, cropWidth: "100", cropHeight: "80", cropX: "5", cropY: "6" });
  const before = helpers.buildTransformRequest(settings);
  const after = helpers.buildTransformRequest({ ...settings, width: "40", height: "30" });
  assert.deepEqual(after.transformations.crop, before.transformations.crop);
  assert.equal(settings.cropX, "5");
});

test("crop offsets are optional, zero is preserved, and the DTO's full offset range is accepted", () => {
  const settings = editorSettings({ cropEnabled: true, cropWidth: "1", cropHeight: "4000" });
  assert.deepEqual(helpers.buildTransformRequest(settings), { transformations: { crop: { width: 1, height: 4000 } } });
  assert.deepEqual(helpers.buildTransformRequest({ ...settings, cropX: "0", cropY: String(Number.MAX_SAFE_INTEGER) }), {
    transformations: { crop: { width: 1, height: 4000, x: 0, y: Number.MAX_SAFE_INTEGER } },
  });
});

test("crop requires both dimensions and rejects invalid sizes and offsets", () => {
  const settings = editorSettings({ cropEnabled: true, cropWidth: "500", cropHeight: "400" });
  for (const field of ["cropWidth", "cropHeight"]) {
    assert.throws(() => helpers.buildTransformRequest({ ...settings, [field]: "" }), /both crop width and crop height/);
    for (const value of ["0", "-1", "4001", "1.5", "NaN", "Infinity"]) {
      assert.throws(() => helpers.buildTransformRequest({ ...settings, [field]: value }), /whole number/);
    }
  }
  for (const field of ["cropX", "cropY"]) for (const value of ["-1", "0.5", "NaN", "Infinity", String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.throws(() => helpers.buildTransformRequest({ ...settings, [field]: value }), /whole number/);
  }
});

test("visual landscape and portrait crops become exact original-pixel API coordinates", () => {
  for (const [image, expected] of [
    [{ width: 3000, height: 2000 }, { x: 300, y: 500, width: 1500, height: 1000 }],
    [{ width: 2000, height: 3000 }, { x: 200, y: 750, width: 1000, height: 1500 }],
  ]) {
    const crop = cropHelpers.percentCropToPixels({ unit: "%", x: 10, y: 25, width: 50, height: 50 }, image);
    const settings = editorSettings({ cropEnabled: true, ...cropHelpers.cropFields(crop), width: "800", rotate: "90" });
    assert.deepEqual(helpers.buildTransformRequest(settings, image), { transformations: {
      crop: expected, resize: { width: 800 }, rotate: 90,
    } });
    assert.deepEqual(cropHelpers.settingsCrop(settings, image), expected);
  }
});

test("responsive display size never changes the crop sent to the backend", () => {
  const image = { width: 3024, height: 4032 };
  const expected = { x: 756, y: 1008, width: 1512, height: 2016 };
  // The same rectangle drawn on a desktop or mobile rendition of the portrait.
  for (const width of [600, 240, 137]) {
    const height = width * image.height / image.width;
    const selection = { unit: "%", x: (width / 4) / width * 100, y: (height / 4) / height * 100,
      width: (width / 2) / width * 100, height: (height / 2) / height * 100 };
    assert.deepEqual(cropHelpers.percentCropToPixels(selection, image), expected);
  }
  assert.deepEqual(cropHelpers.percentCropToPixels(cropHelpers.pixelsToPercentCrop(expected, image), image), expected);
});

test("visual selection is sent to transform-original after uploading only the untouched file", async () => {
  const file = png();
  const image = { width: 3000, height: 2000 };
  const crop = cropHelpers.percentCropToPixels({ unit: "%", x: 10, y: 25, width: 50, height: 50 }, image);
  const body = helpers.buildTransformRequest(editorSettings({ cropEnabled: true, ...cropHelpers.cropFields(crop), width: "800", rotate: "90" }), image);
  const calls = [];
  apiClient.defaults.adapter = async (config) => {
    calls.push(config.url);
    if (config.url === "/api/images/upload") {
      assert.deepEqual([...config.data.keys()], ["file"]);
      assert.equal(config.data.get("file"), file);
      assert.deepEqual(Buffer.from(await config.data.get("file").arrayBuffer()), pngBytes);
      return response(config, original);
    }
    assert.equal(config.url, `/api/images/${original._id}/transform`);
    assert.deepEqual(JSON.parse(config.data), { transformations: {
      crop: { x: 300, y: 500, width: 1500, height: 1000 }, resize: { width: 800 }, rotate: 90,
    } });
    return response(config, processed);
  };
  const source = await uploadImage(file, signal());
  await transformImage(source._id, body, signal());
  assert.deepEqual(calls, ["/api/images/upload", `/api/images/${original._id}/transform`]);
});

test("visual crop clamps bounds and rounds edges without spilling past the original", () => {
  const image = { width: 1001, height: 667 };
  assert.deepEqual(cropHelpers.percentCropToPixels({ unit: "%", x: -10, y: -20, width: 120, height: 140 }, image),
    { x: 0, y: 0, width: 1001, height: 667 });
  assert.deepEqual(cropHelpers.percentCropToPixels({ unit: "%", x: 99.99, y: 99.99, width: 20, height: 20 }, image),
    { x: 1000, y: 666, width: 1, height: 1 });
  assert.deepEqual(cropHelpers.percentCropToPixels({ unit: "%", x: 10, y: 20, width: 50, height: 40 }, image),
    { x: 100, y: 133, width: 501, height: 267 });
  for (const value of [0, -1, NaN, Infinity]) {
    assert.equal(cropHelpers.percentCropToPixels({ unit: "%", x: 0, y: 0, width: value, height: 50 }, image), undefined);
  }
});

test("large originals respect the backend's 4000-pixel crop dimension limit", () => {
  const image = { width: 8000, height: 6000 };
  const crop = cropHelpers.percentCropToPixels({ unit: "%", x: 10, y: 10, width: 90, height: 90 }, image);
  assert.deepEqual(crop, { x: 800, y: 600, width: 4000, height: 4000 });
  assert.deepEqual(helpers.buildTransformRequest(editorSettings({ cropEnabled: true, ...cropHelpers.cropFields(crop) }), image),
    { transformations: { crop } });
});

test("out-of-bounds manual crop is rejected before upload even if resize dimensions are larger", () => {
  const image = { width: 1200, height: 800 };
  const settings = editorSettings({ cropEnabled: true, cropWidth: "1000", cropHeight: "700", cropX: "300", cropY: "0", width: "4000" });
  assert.throws(() => helpers.buildTransformRequest(settings, image), /fit within the original image/);
  assert.equal(cropHelpers.settingsCrop(settings, image), undefined);
  assert.throws(() => helpers.buildTransformRequest({ ...settings, cropX: "0", cropY: "101" }, image), /fit within/);
  assert.deepEqual(helpers.buildTransformRequest({ ...settings, cropX: "200", cropY: "100" }, image).transformations.crop,
    { x: 200, y: 100, width: 1000, height: 700 });
});

test("image replacement resets crop to new bounds; removal and disable omit crop", () => {
  const settings = editorSettings({ cropEnabled: true, cropWidth: "3000", cropHeight: "2000", cropX: "1000", cropY: "500", rotate: "90" });
  const image = { width: 500, height: 800 };
  const replaced = cropHelpers.resetCropForImage(settings, image);
  assert.deepEqual(helpers.buildTransformRequest(replaced, image), { transformations: {
    crop: { x: 50, y: 80, width: 400, height: 640 }, rotate: 90,
  } });
  const removed = cropHelpers.resetCropForImage(replaced);
  assert.equal(removed.cropEnabled, false);
  assert.equal(removed.cropWidth, "");
  assert.equal(helpers.buildTransformRequest(removed).transformations.crop, undefined);
  assert.equal(helpers.buildTransformRequest({ ...replaced, cropEnabled: false }, image).transformations.crop, undefined);
  assert.equal(cropHelpers.resetCropForImage(removed, image).cropEnabled, false);
  assert.deepEqual(cropHelpers.initialCrop({ width: 1, height: 1 }), { x: 0, y: 0, width: 1, height: 1 });
});

test("preview removes camera EXIF while uploading the exact unchanged original File", async () => {
  const exif = Buffer.from("45786966000049492a0008000000010012010300010000000600000000000000", "hex");
  const length = Buffer.alloc(2); length.writeUInt16BE(exif.length + 2);
  const scan = Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
  const plain = Buffer.concat([Buffer.from([0xff, 0xd8]), scan]);
  const originalBytes = Buffer.concat([plain.subarray(0, 2), Buffer.from([0xff, 0xe1]), length, exif, scan]);
  const file = new File([originalBytes], "camera.jpg", { type: "image/jpeg" });
  const preview = await imagePreviewSource(file, "image/jpeg");
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), plain);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), originalBytes);
  const multipart = await createUploadFormData(file);
  assert.equal(multipart.get("file"), file);
  assert.deepEqual(Buffer.from(await multipart.get("file").arrayBuffer()), originalBytes);
});

test("PNG and WebP EXIF removal preserves image chunks and repairs container metadata", async () => {
  const exif = Buffer.from("Exif\0\0test");
  const pngChunk = Buffer.alloc(12 + exif.length);
  pngChunk.writeUInt32BE(exif.length); pngChunk.write("eXIf", 4); exif.copy(pngChunk, 8);
  const taggedPng = new File([pngBytes.subarray(0, 33), pngChunk, pngBytes.subarray(33)], "camera.png");
  assert.deepEqual(Buffer.from(await (await imagePreviewSource(taggedPng, "image/png")).arrayBuffer()), pngBytes);
  const chunk = (tag, data) => {
    const result = Buffer.alloc(8 + data.length + data.length % 2);
    result.write(tag); result.writeUInt32LE(data.length, 4); data.copy(result, 8); return result;
  };
  const header = Buffer.from("RIFF0000WEBP");
  const vp8x = chunk("VP8X", Buffer.from([8, 0, 0, 0, 1, 0, 0, 1, 0, 0]));
  const pixels = chunk("VP8 ", Buffer.from([1, 2, 3]));
  const webp = Buffer.concat([header, vp8x, chunk("EXIF", exif), pixels]);
  webp.writeUInt32LE(webp.length - 8, 4);
  const cleaned = Buffer.from(await (await imagePreviewSource(new File([webp], "camera.webp"), "image/webp")).arrayBuffer());
  const expected = Buffer.concat([header, vp8x, pixels]);
  expected.writeUInt32LE(expected.length - 8, 4); expected[20] = 0;
  assert.deepEqual(cleaned, expected);
  assert.equal(webp[20], 8);
});

test("decoded original dimensions reach crop state without replacing the upload File", async () => {
  const savedImage = globalThis.Image;
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  const file = png();
  globalThis.Image = class { naturalWidth = 900; naturalHeight = 1600; async decode() {} };
  URL.createObjectURL = () => "blob:original-crop";
  URL.revokeObjectURL = () => {};
  try {
    const preview = await helpers.prepareImagePreview(file);
    assert.equal(preview.file, file);
    assert.equal(preview.width, 900);
    assert.equal(preview.height, 1600);
    assert.equal(preview.url, "blob:original-crop");
  } finally {
    URL.createObjectURL = create; URL.revokeObjectURL = revoke;
    if (savedImage) globalThis.Image = savedImage; else delete globalThis.Image;
  }
});

test("rotation accepts fractions and boundaries and rejects nonfinite/out-of-range values", () => {
  for (const angle of [-360, -22.5, 45.25, 90, 180, 270, 360]) {
    assert.deepEqual(helpers.buildTransformRequest(editorSettings({ rotate: String(angle) })), { transformations: { rotate: angle } });
  }
  for (const angle of ["-361", "360.1", "NaN", "Infinity", "hello"]) {
    assert.throws(() => helpers.buildTransformRequest(editorSettings({ rotate: angle })), /Rotation must be/);
  }
});

test("rejects an entirely inactive recipe instead of sending an empty transformations object", () => {
  assert.throws(() => helpers.buildTransformRequest(editorSettings()), /at least one transformation/);
  assert.throws(() => helpers.buildTransformRequest(editorSettings({ rotate: "0" })), /at least one transformation/);
});

test("custom output preserves all supported formats and quality limits", () => {
  for (const format of ["jpeg", "png", "webp"]) for (const quality of [1, 80, 100]) {
    assert.deepEqual(helpers.buildTransformRequest(editorSettings({ outputEnabled: true, format, quality })), { transformations: { format, quality } });
  }
});

test("reset creates fresh default settings with all optional operations inactive", () => {
  const changed = helpers.createDefaultSettings();
  Object.assign(changed, { cropEnabled: true, cropWidth: "10", cropHeight: "10", rotate: "90", flip: true, grayscale: true, quality: 20 });
  const reset = helpers.createDefaultSettings();
  assert.notEqual(reset, changed);
  assert.deepEqual(reset, {
    width: "", height: "", cropEnabled: false, cropWidth: "", cropHeight: "", cropX: "", cropY: "",
    rotate: "", flip: false, mirror: false, grayscale: false, sepia: false,
    outputEnabled: true, quality: 80, format: "webp",
  });
  assert.deepEqual(helpers.buildTransformRequest(reset), { transformations: { quality: 80, format: "webp" } });
});

test("validates optional applied transformations without rejecting historical records that omit them", async () => {
  for (const transformations of [
    null, {}, [], { crop: {} }, { crop: { width: 1, height: 1, x: -1 } }, { resize: {} },
    { resize: { width: "800" } }, { rotate: 361 }, { flip: "true" }, { mirror: 1 },
    { filters: {} }, { filters: { grayscale: "true" } }, { filters: { contrast: true } },
    { quality: 101 }, { format: "gif" }, { unknown: true },
  ]) {
    assert.equal(helpers.isImageTransformations(transformations), false);
    apiClient.defaults.adapter = async (config) => response(config, { ...processed, transformations });
    await assert.rejects(transformImage(original._id, helpers.buildTransformRequest(helpers.DEFAULT_SETTINGS), signal()), /incomplete image details/);
  }
  apiClient.defaults.adapter = async (config) => response(config, { ...processed, transformations: undefined });
  assert.equal((await transformImage(original._id, helpers.buildTransformRequest(helpers.DEFAULT_SETTINGS), signal()))._id, processed._id);
});

test("uses returned applied metadata instead of echoing the submitted recipe", async () => {
  const applied = { crop: { width: 200, height: 100, x: 10, y: 0 }, resize: { width: 80 }, flip: true, mirror: true, rotate: -22.5, filters: { grayscale: true, sepia: true }, quality: 75, format: "png" };
  apiClient.defaults.adapter = async (config) => response(config, { ...processed, format: "png", quality: 75, transformations: applied });
  const result = await transformImage(original._id, helpers.buildTransformRequest(helpers.DEFAULT_SETTINGS), signal());
  assert.deepEqual(result.transformations, applied);
  const markup = renderToStaticMarkup(createElement(ProcessingResult, { image: result, refreshing: false, onRefresh() {}, onReset() {} }));
  for (const label of ["Crop 200 × 100 at (10, 0)", "Resize width 80 px", "Flip vertically", "Mirror horizontally", "Rotate -22.5°", "Grayscale", "Sepia", "PNG", "QUALITY", "75"]) assert.ok(markup.includes(label), label);
  assert.deepEqual(helpers.appliedTransformationLabels({ rotate: 0, flip: false, mirror: false, filters: { grayscale: false, sepia: false }, quality: 80, format: "webp" }), []);
  assert.deepEqual(helpers.appliedTransformationLabels(undefined), []);
});

test("recognizes only the exact safe backend crop-bounds error", () => {
  const error = httpError(400);
  error.response.data.message = "Crop rectangle must fit within the original image (1200 x 800 pixels)";
  assert.match(getImageErrorMessage(error), /original image \(1200 × 800 pixels\)/);
  assert.match(getImageErrorMessage(error), /resize settings do not change/);
  error.response.data.message += " database password: secret";
  assert.doesNotMatch(getImageErrorMessage(error), /password|secret|1200/);
});

const legacy = { ...processed, _id: "66e83a109af861ce27c86a04", kind: undefined, originalImageId: undefined, transformations: undefined };
const version2 = { ...processed, _id: "66e83a109af861ce27c86a05", format: "jpeg", quality: 90, transformations: { rotate: 90, filters: { grayscale: true }, format: "jpeg", quality: 90 } };
const pageResponse = (items, page = 1, limit = 10, total = items.length) => ({ items, page, limit, total, totalPages: Math.ceil(total / limit) });

// Put every original after its versions to exercise families across API pages.
function archiveFixture(count, versionsPerOriginal) {
  let id = 1;
  const nextId = () => (id++).toString(16).padStart(24, "0");
  const originals = Array.from({ length: count }, () => ({ ...original, _id: nextId() }));
  const versions = originals.flatMap((image, index) => Array.from({ length: versionsPerOriginal(index) }, () => ({
    ...processed, _id: nextId(), originalImageId: image._id,
  })));
  return { originals, records: [...versions, ...originals] };
}

function serveArchive(records, requests = []) {
  apiClient.defaults.adapter = async (config) => {
    const { page, limit } = config.params;
    requests.push({ page, limit });
    return response(config, pageResponse(records.slice((page - 1) * limit, page * limit), page, limit, records.length), 200);
  };
}

// Flush the deferred start and the mocked transport's promise chain.
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test("infinite history initially requests only 10 records and merges families across batches", async () => {
  const { records, originals } = archiveFixture(7, () => 2);
  const requests = [];
  serveArchive(records, requests);
  const store = createInfiniteImageHistory();
  store.start();
  await settle();
  assert.deepEqual(requests, [{ page: 1, limit: 10 }]);
  assert.equal(store.getSnapshot().records.length, 10);
  assert.equal(store.getSnapshot().total, 21);
  assert.equal(store.getSnapshot().hasMore, true);
  const firstKey = history.groupImagesByOriginal(store.getSnapshot().records)[0].key;
  await store.loadMore();
  assert.equal(store.getSnapshot().records.length, 20);
  await store.loadMore();
  assert.equal(store.getSnapshot().records.length, 21);
  assert.equal(store.getSnapshot().hasMore, false);
  const groups = history.groupImagesByOriginal(store.getSnapshot().records);
  assert.equal(groups[0].key, firstKey);
  assert.equal(groups.length, originals.length);
  assert.ok(groups.every((group) => group.original && group.versions.length === 2));
  await store.loadMore();
  assert.deepEqual(requests, [1, 2, 3].map((page) => ({ page, limit: 10 })));
  store.stop();
});

test("empty, short-final, and exact-full final pages stop at API totalPages", async () => {
  for (const count of [0, 3, 10, 20]) {
    const { records } = archiveFixture(count, () => 0);
    const requests = [];
    serveArchive(records, requests);
    const store = createInfiniteImageHistory();
    store.start();
    await settle();
    if (count > 10) await store.loadMore();
    assert.equal(store.getSnapshot().hasMore, false);
    assert.equal(store.getSnapshot().records.length, count);
    await store.loadMore();
    assert.equal(requests.length, Math.max(1, Math.ceil(count / 10)));
    store.stop();
  }
});

test("observer bursts issue one request and duplicate IDs never append twice", async () => {
  const { records } = archiveFixture(20, () => 0);
  const next = deferred();
  const requests = [];
  const store = createInfiniteImageHistory(async (page, limit) => {
    requests.push({ page, limit });
    if (page === 1) return pageResponse(records.slice(0, 10), page, limit, 20);
    return next.promise;
  });
  store.start();
  await settle();
  const loading = store.loadMore();
  await Promise.all([store.loadMore(), store.loadMore(), store.loadMore()]);
  assert.equal(requests.length, 2);
  assert.equal(store.getSnapshot().loading, true);
  assert.equal(store.getSnapshot().records.length, 10);
  next.resolve(pageResponse([records[9], ...records.slice(10, 19)], 2, 10, 20));
  await loading;
  assert.equal(store.getSnapshot().records.length, 19);
  assert.equal(new Set(store.getSnapshot().records.map((image) => image._id)).size, 19);
  store.stop();
});

test("later errors retain records and only a manual retry requests the same failed page", async () => {
  const { records } = archiveFixture(15, () => 0);
  const requests = [];
  let fail = true;
  const store = createInfiniteImageHistory(async (page, limit) => {
    requests.push(page);
    if (page === 2 && fail) throw httpError(503);
    return pageResponse(records.slice((page - 1) * limit, page * limit), page, limit, records.length);
  });
  store.start();
  await settle();
  await store.loadMore();
  assert.equal(store.getSnapshot().records.length, 10);
  assert.equal(store.getSnapshot().page, 1);
  assert.match(store.getSnapshot().error, /unavailable/);
  await store.loadMore();
  await store.loadMore();
  assert.deepEqual(requests, [1, 2]);
  fail = false;
  store.retry();
  await settle();
  assert.deepEqual(requests, [1, 2, 2]);
  assert.equal(store.getSnapshot().records.length, 15);
  assert.equal(store.getSnapshot().error, null);
  store.stop();
});

test("Strict Mode setup/cleanup/setup starts only one initial transport", async () => {
  let requests = 0;
  const store = createInfiniteImageHistory(async () => { requests++; return pageResponse([]); });
  store.start();
  store.stop();
  store.start();
  await settle();
  assert.equal(requests, 1);
  store.stop();
});

test("refresh rejects stale success and stale failures even when transport ignores abort", async () => {
  for (const failure of [false, true]) {
    const pending = deferred();
    let calls = 0;
    let staleSignal;
    const store = createInfiniteImageHistory(async (page, limit, signal) => {
      if (++calls === 1) { staleSignal = signal; return pending.promise; }
      return pageResponse([original], page, limit);
    });
    store.start();
    await settle();
    store.refresh();
    assert.equal(staleSignal.aborted, true);
    await settle();
    if (failure) pending.reject(httpError(503));
    else pending.resolve(pageResponse([processed]));
    await settle();
    assert.deepEqual(store.getSnapshot().records, [original]);
    assert.equal(store.getSnapshot().error, null);
    store.stop();
  }
});

test("stopping a collection prevents pending results and queued loads entering another collection", async () => {
  const pending = deferred();
  let signal;
  const old = createInfiniteImageHistory(async (_page, _limit, requestSignal) => { signal = requestSignal; return pending.promise; });
  old.start();
  await settle();
  old.stop();
  const next = createInfiniteImageHistory(async () => pageResponse([original]));
  next.start();
  pending.resolve(pageResponse([processed]));
  await settle();
  assert.equal(signal.aborted, true);
  assert.deepEqual(old.getSnapshot().records, []);
  assert.deepEqual(next.getSnapshot().records, [original]);
  next.stop();
});

test("deletion aborts a pending batch and restarts offsets so surviving images are not skipped", async () => {
  for (const cascade of [false, true]) {
    const fixture = archiveFixture(9, () => 2);
    let records = fixture.records;
    const pending = deferred();
    const requests = [];
    let hold = true;
    const store = createInfiniteImageHistory(async (page, limit) => {
      requests.push(page);
      if (page === 2 && hold) return pending.promise;
      return pageResponse(records.slice((page - 1) * limit, page * limit), page, limit, records.length);
    });
    store.start();
    await settle();
    const stale = store.loadMore();
    store.pause();
    const staleResponse = pageResponse(records.slice(10, 20), 2, 10, records.length);
    const id = cascade ? fixture.originals[0]._id : records[0]._id;
    records = records.filter((image) => image._id !== id && (!cascade || image.originalImageId !== id));
    hold = false;
    store.refresh();
    await settle();
    pending.resolve(staleResponse);
    await stale;
    while (store.getSnapshot().hasMore) await store.loadMore();
    assert.deepEqual(store.getSnapshot().records.map((image) => image._id), records.map((image) => image._id));
    assert.equal(store.getSnapshot().total, records.length);
    assert.deepEqual(requests, [1, 2, 1, 2, 3]);
    store.stop();
  }
});

test("external count changes preserve loaded images and require a manual restart", async () => {
  let records = archiveFixture(15, () => 0).records;
  const requests = [];
  const store = createInfiniteImageHistory(async (page, limit) => {
    requests.push(page);
    return pageResponse(records.slice((page - 1) * limit, page * limit), page, limit, records.length);
  });
  store.start();
  await settle();
  records = records.slice(1);
  await store.loadMore();
  assert.match(store.getSnapshot().error, /archive changed/);
  assert.equal(store.getSnapshot().records.length, 10);
  await store.loadMore();
  store.retry();
  await settle();
  await store.loadMore();
  assert.deepEqual(requests, [1, 2, 1, 2]);
  assert.deepEqual(store.getSnapshot().records, records);
  store.stop();
});

test("partial groups avoid claiming missing originals or versions until the list is complete", () => {
  const render = (images, incomplete) => renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(ImageGroupCard, { group: history.groupImagesByOriginal(images)[0], incomplete, deleteDisabled: false, onDelete() {} })));
  assert.match(render([processed], true), /original may appear/);
  assert.doesNotMatch(render([processed], true), /original is unavailable/);
  assert.match(render([original], true), /No versions loaded yet/);
  assert.match(render([original], false), /No transformed versions yet/);
  const props = { hasMore: true, loading: false, error: null, disabled: false, onLoadMore() {}, onRetry() {} };
  assert.match(renderToStaticMarkup(createElement(InfiniteImageLoader, { ...props, loading: true })), /Loading more images/);
  const failed = renderToStaticMarkup(createElement(InfiniteImageLoader, { ...props, error: "Try again" }));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Retry/);
  assert.match(renderToStaticMarkup(createElement(InfiniteImageLoader, { ...props, hasMore: false })), /reached the end/);
});

test("history requests exact server pagination with the existing Bearer interceptor", async () => {
  tokenStorage.setToken("history-test-token");
  apiClient.defaults.adapter = async (config) => {
    assert.equal(config.method, "get");
    assert.equal(config.url, "/api/images");
    assert.deepEqual(config.params, { page: 2, limit: 10 });
    assert.equal(apiClient.getUri(config), "https://api.example.test/api/images?page=2&limit=10");
    assert.equal(config.headers.get("Authorization"), "Bearer history-test-token");
    return response(config, pageResponse([processed, original, legacy], 2, 10, 42), 200);
  };
  assert.deepEqual(await getImages(2, 10, signal()), pageResponse([processed, original, legacy], 2, 10, 42));
});

test("history defaults to page 1 and 10 records and accepts empty collections", async () => {
  apiClient.defaults.adapter = async (config) => {
    assert.deepEqual(config.params, { page: 1, limit: 10 });
    return response(config, pageResponse([]), 200);
  };
  assert.deepEqual(await getImages(), { items: [], page: 1, limit: 10, total: 0, totalPages: 0 });
  assert.deepEqual(history.groupImagesByOriginal([]), []);
});

test("history supports the dashboard's four records and backend maximum of 50", async () => {
  for (const limit of [4, 50]) {
    apiClient.defaults.adapter = async (config) => {
      assert.deepEqual(config.params, { page: 1, limit });
      return response(config, pageResponse([original], 1, limit));
    };
    assert.equal((await getImages(1, limit)).limit, limit);
  }
});

test("rejects invalid pagination before transport", async () => {
  apiClient.defaults.adapter = async () => assert.fail("Invalid pagination reached transport");
  for (const [page, limit] of [[0, 10], [1.5, 10], [100001, 10], [1, 0], [1, 51], [1, 2.5], [NaN, 10]]) {
    await assert.rejects(getImages(page, limit), /valid image page/);
  }
});

test("validates pagination envelopes and records without trusting the example response", async () => {
  for (const data of [
    null, [], {}, { ...pageResponse([]), items: {} }, { ...pageResponse([]), total: -1 },
    { ...pageResponse([]), total: 1.5 }, { ...pageResponse([]), totalPages: 1 },
    { ...pageResponse([]), page: 2 }, { ...pageResponse([]), limit: 50 },
    pageResponse([{ ...original, _id: "image-id" }]), pageResponse([original, original]),
    pageResponse(Array.from({ length: 11 }, () => original)),
  ]) {
    apiClient.defaults.adapter = async (config) => response(config, data);
    await assert.rejects(getImages(), /incomplete image history/);
  }
});

test("does not reject records just because separately queried counts changed concurrently", async () => {
  apiClient.defaults.adapter = async (config) => response(config, pageResponse([original], 1, 10, 0));
  assert.equal((await getImages()).items.length, 1);
});

test("groups multiple versions with the original even when versions arrive first, without mutation", () => {
  const records = [version2, processed, legacy, original];
  const snapshot = structuredClone(records);
  const groups = history.groupImagesByOriginal(records);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].original, original);
  assert.deepEqual(groups[0].versions, [version2, processed]);
  assert.equal(groups[0].standalone, null);
  assert.equal(groups[1].standalone, legacy);
  assert.deepEqual(records, snapshot);
});

test("keeps orphan versions visible and distinguishes unlinked/legacy records", () => {
  const unlinked = { ...processed, _id: "66e83a109af861ce27c86a06", originalImageId: undefined };
  const groups = history.groupImagesByOriginal([processed, version2, unlinked, legacy]);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].original, null);
  assert.deepEqual(groups[0].versions, [processed, version2]);
  assert.equal(groups[1].standalone, unlinked);
  assert.equal(groups[2].standalone, legacy);
});

test("groups by IDs, never by matching filenames, and preserves newest group's position", () => {
  const secondOriginal = { ...original, _id: "66e83a109af861ce27c86a07" };
  const groups = history.groupImagesByOriginal([processed, secondOriginal, original]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].original._id, original._id);
  assert.equal(groups[1].original._id, secondOriginal._id);
});

test("refresh uses the same endpoint/helper for originals, versions, and legacy images", async () => {
  assert.equal(refreshImageLinks, getImageById);
  for (const image of [original, processed, legacy]) {
    apiClient.defaults.adapter = async (config) => {
      assert.equal(config.method, "get");
      assert.equal(config.url, `/api/images/${image._id}`);
      return response(config, image, 200);
    };
    assert.equal((await getImageById(image._id, signal()))._id, image._id);
  }
  apiClient.defaults.adapter = async (config) => response(config, original);
  await assert.rejects(getImageById(processed._id, signal()), /incomplete image details/);
});

test("detects expired, near-expiry, missing, and invalid access timestamps", () => {
  const now = Date.parse("2026-09-20T12:00:00Z");
  assert.equal(history.isPresignedUrlExpired("2026-09-20T12:15:00Z", now), false);
  assert.equal(history.isPresignedUrlExpired("2026-09-20T12:00:30Z", now), true);
  assert.equal(history.isPresignedUrlExpired("2026-09-20T12:00:31Z", now), false);
  assert.equal(history.isPresignedUrlExpired("2026-09-20T12:00:00Z", now, 0), true);
  assert.equal(history.isPresignedUrlExpired("2026-09-20T12:00:01Z", now, 0), false);
  for (const value of [undefined, "", "invalid", "2026-09-20T11:00:00Z"]) assert.equal(history.isPresignedUrlExpired(value, now), true);
});

test("corrects empty pages after a final deletion, cascade deletion, or concurrent changes", () => {
  assert.equal(history.validHistoryPage(pageResponse([], 5, 10, 40)), 4);
  assert.equal(history.validHistoryPage(pageResponse([], 5, 10, 3)), 1);
  assert.equal(history.validHistoryPage(pageResponse([], 5, 10, 0)), 1);
  assert.equal(history.validHistoryPage(pageResponse([], 1, 10, 0)), 1);
  assert.equal(history.validHistoryPage(pageResponse([original], 2, 10, 11)), 2);
  // An empty page with a stale count still steps backward, never loops on the same page.
  assert.equal(history.validHistoryPage(pageResponse([], 5, 10, 60)), 4);
});

test("delete confirmations distinguish original cascade, individual version, and legacy image", () => {
  assert.match(history.imageDeleteMessage(original), /all of its transformed versions/);
  assert.match(history.imageDeleteMessage(processed), /original image and other versions will be kept/);
  assert.match(history.imageDeleteMessage(legacy), /Only this saved image/);
  const markup = renderToStaticMarkup(createElement(DeleteImageDialog, { image: original, pending: true, error: null, onCancel() {}, onConfirm() {}, onRefresh() {} }));
  assert.match(markup, /<dialog/);
  assert.match(markup, /aria-labelledby="delete-image-title"/);
  assert.match(markup, /aria-describedby="delete-image-description"/);
  assert.match(markup, /Deleting…/);
  assert.equal((markup.match(/disabled=""/g) ?? []).length, 2);
});

test("deletes only the requested ID through the shared authenticated client", async () => {
  tokenStorage.setToken("delete-test-token");
  for (const image of [original, processed, legacy]) {
    let calls = 0;
    apiClient.defaults.adapter = async (config) => {
      calls++;
      assert.equal(config.method, "delete");
      assert.equal(config.url, `/api/images/${image._id}`);
      assert.equal(config.headers.get("Authorization"), "Bearer delete-test-token");
      assert.equal(config.data, undefined);
      return response(config, { message: "Image deleted successfully" }, 200);
    };
    await deleteImage(image._id, signal());
    assert.equal(calls, 1); // Cascade belongs to the backend, not client-side loops.
  }
});

test("does not confirm deletion on malformed responses or failed transport", async () => {
  for (const data of [undefined, {}, { message: "unknown" }]) {
    apiClient.defaults.adapter = async (config) => response(config, data, 200);
    await assert.rejects(deleteImage(processed._id, signal()), /Deletion could not be confirmed/);
  }
  for (const status of [404, 429, 500, 502]) {
    apiClient.defaults.adapter = async (config) => { throw httpError(status, config); };
    await assert.rejects(deleteImage(processed._id, signal()));
  }
});

test("list, detail, and delete preserve the global 401 behavior and cancellation", async () => {
  for (const send of [() => getImages(1, 10, signal()), () => getImageById(original._id, signal()), () => deleteImage(processed._id, signal())]) {
    tokenStorage.setToken("expired-history-token");
    apiClient.defaults.adapter = async (config) => { throw httpError(401, config); };
    await assert.rejects(send());
    assert.equal(tokenStorage.getToken(), null);
  }
  const controller = new AbortController();
  controller.abort();
  apiClient.defaults.adapter = async () => assert.fail("Canceled history transport ran");
  await assert.rejects(getImages(1, 10, controller.signal));
  await assert.rejects(deleteImage(original._id, controller.signal));
});

test("gallery renders actual labels, groups and details without exposing S3 keys", () => {
  const group = history.groupImagesByOriginal([version2, processed, original])[0];
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ImageGroupCard, { group, deleteDisabled: false, onDelete() {} })));
  for (const text of ["Original", "Processed version", "View versions", "(2)", "Image details", "Rotate 90°", "Grayscale", "Quality 90"]) assert.ok(markup.includes(text), text);
  assert.ok(!markup.includes("on this page"));
  assert.doesNotMatch(markup, /originals\/user\/|transformed\/user\//);
  const orphan = history.groupImagesByOriginal([{ ...processed, url: undefined, downloadUrl: undefined, urlExpiresAt: undefined }])[0];
  const orphanMarkup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ImageGroupCard, { group: orphan, deleteDisabled: false, onDelete() {} })));
  assert.match(orphanMarkup, /original is unavailable/);
  assert.match(orphanMarkup, /Refresh preview/);
  assert.doesNotMatch(orphanMarkup, /<img/);
});

test("history error messages describe reads/deletes and never expose server internals", () => {
  for (const operation of ["load", "delete"]) for (const status of [400, 401, 404, 429, 500, 502]) {
    const message = getImageErrorMessage(httpError(status), operation);
    assert.doesNotMatch(message, /password|secret|private transport/);
    if (status === 401) assert.match(message, /sign in again/);
  }
  assert.match(getImageErrorMessage(httpError(502), "delete"), /Some files may have been removed/);
  assert.match(getImageErrorMessage(new AxiosError("private", "ERR_NETWORK"), "delete"), /already have been deleted/);
  assert.match(getImageErrorMessage(new AxiosError("private", "ERR_NETWORK"), "load"), /network or CORS/);
});


test("favorites list uses exact pagination, signed metadata and Bearer authorization", async () => {
  tokenStorage.setToken("favorites-token");
  apiClient.defaults.adapter = async (config) => {
    assert.equal(config.url, "/api/images/favorites");
    assert.equal(apiClient.getUri(config), "https://api.example.test/api/images/favorites?page=2&limit=10");
    assert.equal(config.headers.get("Authorization"), "Bearer favorites-token");
    assert.deepEqual(config.params, { page: 2, limit: 10 });
    return response(config, pageResponse([{ ...processed, isFavorite: true }], 2, 10, 11));
  };
  const page = await getFavoriteImages(2, 10);
  assert.equal(page.total, 11);
  assert.equal(page.totalPages, 2);
  assert.equal(page.items[0].isFavorite, true);
  assert.equal(page.items[0].downloadUrl, processed.downloadUrl);
  assert.equal("path" in page.items[0], false);
  assert.equal("originalKey" in page.items[0], false);
});

test("favorite mutations send no body, encode IDs, and reconcile validated responses", async () => {
  tokenStorage.setToken("favorites-token");
  for (const value of [true, false]) {
    apiClient.defaults.adapter = async (config) => {
      assert.equal(config.url, `/api/images/${original._id}/favorite`);
      assert.equal(config.method, value ? "put" : "delete");
      assert.equal(config.data, undefined);
      assert.equal(config.headers.get("Authorization"), "Bearer favorites-token");
      return response(config, { imageId: original._id, isFavorite: value }, 200);
    };
    assert.deepEqual(await setImageFavorite(original._id, value, signal()), { imageId: original._id, isFavorite: value });
  }
  apiClient.defaults.adapter = async (config) => {
    assert.equal(config.url, "/api/images/a%2Fb/favorite");
    return response(config, { imageId: "a/b", isFavorite: true });
  };
  await setImageFavorite("a/b", true, signal());
  for (const data of [null, {}, { imageId: processed._id, isFavorite: true }, { imageId: original._id, isFavorite: "true" }]) {
    apiClient.defaults.adapter = async (config) => response(config, data);
    await assert.rejects(setImageFavorite(original._id, true, signal()), /could not be confirmed/);
  }
});

test("favorites accepts empty and beyond-end pages, rejects invalid pagination and nonfavorites", async () => {
  for (const [page, total] of [[1, 0], [4, 11]]) {
    apiClient.defaults.adapter = async (config) => response(config, pageResponse([], page, 10, total));
    const result = await getFavoriteImages(page);
    assert.equal(result.totalPages, Math.ceil(total / 10));
    assert.equal(history.validHistoryPage(result), total ? 2 : 1);
  }
  for (const [page, limit] of [[0, 10], [100001, 10], [1, 51], [1, 1.5]]) {
    apiClient.defaults.adapter = async () => assert.fail("Invalid request reached transport");
    await assert.rejects(getFavoriteImages(page, limit), /valid image page/);
  }
  apiClient.defaults.adapter = async (config) => response(config, pageResponse([original]));
  await assert.rejects(getFavoriteImages(), /incomplete image history/);
});

test("optimistic state deduplicates clicks and protects against reads begun before or during a mutation", () => {
  const state = createFavoriteState();
  const before = state.read();
  const request = state.begin(original);
  const during = state.read();
  assert.equal(state.getSnapshot().values.get(original._id).value, true);
  assert.equal(state.begin(original), null);
  assert.equal(state.accept([original], before)[0].isFavorite, true);
  assert.equal(state.accept([original], during)[0].isFavorite, true);
  state.finish(request, true);
  assert.equal(state.accept([original], during)[0].isFavorite, true);
  assert.equal(state.getSnapshot().pending, 0);
  assert.equal(state.accept([original], state.read())[0].isFavorite, false, "Fresh server reads remain authoritative");
});

test("parallel removals roll back independently without reordering retained records", () => {
  const state = createFavoriteState();
  const images = [version2, processed, original].map((image) => ({ ...image, isFavorite: true }));
  state.accept(images, state.read());
  const first = state.begin(images[0]);
  const second = state.begin(images[1]);
  const visible = () => images.filter((image) => state.getSnapshot().values.get(image._id).value).map((image) => image._id);
  assert.deepEqual(visible(), [original._id]);
  state.finish(first, first.previous, "Failed");
  assert.deepEqual(visible(), [version2._id, original._id]);
  state.finish(second, false);
  assert.deepEqual(visible(), [version2._id, original._id]);
  assert.equal(state.getSnapshot().pending, 0);
});

test("session changes abort mutations and ignore old reads, successes, and failures", () => {
  const state = createFavoriteState();
  const ticket = state.read();
  const old = state.begin(original);
  state.clear();
  assert.equal(old.controller.signal.aborted, true);
  state.accept([{ ...original, isFavorite: true }], ticket);
  state.finish(old, true);
  state.finish(old, false, "Old account error");
  assert.equal(state.getSnapshot().values.size, 0);
  assert.equal(state.getSnapshot().error, null);
  const next = state.begin(original);
  state.finish(old, true);
  assert.equal(state.getSnapshot().values.get(original._id).pending, next.controller);
});

test("deferred list cannot overwrite a successful optimistic toggle", async () => {
  let resolveList;
  let listStarted;
  const started = new Promise((resolve) => { listStarted = resolve; });
  apiClient.defaults.adapter = (config) => {
    if (config.method === "get") return new Promise((resolve) => { resolveList = () => resolve(response(config, pageResponse([original]))); listStarted(); });
    return Promise.resolve(response(config, { imageId: original._id, isFavorite: true }));
  };
  const pendingList = getImages();
  await started;
  await toggleFavorite(original);
  resolveList();
  const result = await pendingList;
  assert.equal(result.items[0].isFavorite, true);
  assert.equal(favoriteState.getSnapshot().values.get(original._id).value, true);
});

test("toggle rolls back on failures, sends once while pending and trusts mutation response", async () => {
  let rejectMutation;
  let calls = 0;
  let mutationStarted;
  const started = new Promise((resolve) => { mutationStarted = resolve; });
  apiClient.defaults.adapter = (config) => new Promise((resolve, reject) => {
    calls++;
    rejectMutation = () => reject(httpError(500, config));
    mutationStarted();
  });
  const pending = toggleFavorite(original);
  await started;
  assert.equal(favoriteState.getSnapshot().values.get(original._id).value, true);
  await toggleFavorite(original);
  assert.equal(calls, 1);
  rejectMutation();
  await pending;
  assert.equal(favoriteState.getSnapshot().values.get(original._id).value, false);
  assert.match(favoriteState.getSnapshot().error, /undone/);
  apiClient.defaults.adapter = async (config) => response(config, { imageId: original._id, isFavorite: false });
  await toggleFavorite(original);
  assert.equal(favoriteState.getSnapshot().values.get(original._id).value, false);
});

test("rate limiting honors seconds and HTTP dates and never replays mutations", async () => {
  const error = httpError(429);
  const now = Date.parse("2026-09-30T12:00:00Z");
  error.response.headers.set("Retry-After", "120");
  assert.equal(getRetryAfterDeadline(error, now), now + 120000);
  error.response.headers.set("Retry-After", "Wed, 30 Sep 2026 12:03:00 GMT");
  assert.equal(getRetryAfterDeadline(error, now), now + 180000);
  error.response.headers.delete("Retry-After");
  assert.equal(getRetryAfterDeadline(error, now), now + 60000);
  let calls = 0;
  apiClient.defaults.adapter = async (config) => {
    calls++;
    const failure = httpError(429, config);
    failure.response.headers.set("Retry-After", "120");
    throw failure;
  };
  await toggleFavorite(original);
  await toggleFavorite(original);
  await assert.rejects(getFavoriteImages(), /Wait before trying again/);
  assert.equal(calls, 1);
  assert.equal(favoriteState.getSnapshot().values.get(original._id).value, false);
  assert.match(favoriteState.getSnapshot().error, /120 seconds/);
  tokenStorage.setToken("new-account");
  assert.equal(favoriteState.getSnapshot().retryAt, 0);
  assert.equal(favoriteState.getSnapshot().values.size, 0);
});

test("favorites preserve expiry handling and cancellation", async () => {
  for (const send of [() => getFavoriteImages(), () => setImageFavorite(original._id, true, signal()), () => setImageFavorite(original._id, false, signal())]) {
    tokenStorage.setToken("expired-favorite-token");
    apiClient.defaults.adapter = async (config) => { throw httpError(401, config); };
    await assert.rejects(send());
    assert.equal(tokenStorage.getToken(), null);
    assert.equal(favoriteState.getSnapshot().values.size, 0);
  }
  const controller = new AbortController();
  controller.abort();
  apiClient.defaults.adapter = async () => assert.fail("Canceled transport ran");
  await assert.rejects(getFavoriteImages(1, 10, controller.signal));
  await assert.rejects(setImageFavorite(original._id, true, controller.signal));
});

test("favorite controls expose state, accessible names and pending disabled state", () => {
  const render = () => renderToStaticMarkup(createElement(FavoriteButton, { image: original }));
  assert.match(render(), /aria-pressed="false"/);
  assert.match(render(), /aria-label="Add to favorites: photo.png"/);
  const request = favoriteState.begin(original);
  assert.match(render(), /aria-pressed="true"/);
  assert.match(render(), /aria-label="Remove from favorites: photo.png"/);
  assert.match(render(), /disabled=""/);
  favoriteState.finish(request, true);
  assert.doesNotMatch(render(), /disabled=""/);
});

const callbacks = { onOriginal() {}, onPhase() {} };

test("Transform again resolves originals, versions and identifiable legacy references without guessing", () => {
  assert.equal(reprocessing.originalIdForImage(original), original._id);
  assert.equal(reprocessing.originalIdForImage(processed), original._id);
  assert.equal(reprocessing.originalIdForImage(legacy), null);
  assert.equal(reprocessing.originalIdForImage({ ...processed, originalImageId: undefined }), null);
  assert.equal(reprocessing.originalIdForImage({ ...legacy, originalImageId: original._id }), original._id);
  assert.equal(reprocessing.originalIdForImage({ ...processed, originalImageId: "invalid" }), null);
  assert.equal(reprocessing.savedOriginalUrl(processed), `/upload?originalId=${original._id}`);
  const group = history.groupImagesByOriginal([processed, original])[0];
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ImageGroupCard, { group, deleteDisabled: false, onDelete() {} })));
  assert.equal((markup.match(new RegExp(`href="/upload\\?originalId=${original._id}"`, "g")) ?? []).length, 2);
  assert.doesNotMatch(markup, new RegExp(`originalId=${processed._id}`));
  const legacyMarkup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ImageGroupCard, { group: history.groupImagesByOriginal([legacy])[0], deleteDisabled: false, onDelete() {} })));
  assert.match(legacyMarkup, /Transform again unavailable: no saved original/);
  assert.doesNotMatch(legacyMarkup, /originalId=/);
});

test("saved-original processing fetches metadata then transforms only the original, with no upload or storage download", async () => {
  const paths = [];
  tokenStorage.setToken("reprocess-test-token");
  apiClient.defaults.adapter = async (config) => {
    assert.equal(config.headers.get("Authorization"), "Bearer reprocess-test-token");
    paths.push([config.method, config.url]);
    if (config.method === "get") return response(config, { ...original, isFavorite: true });
    assert.deepEqual(JSON.parse(config.data), { transformations: { resize: { width: 100 }, format: "webp", quality: 80 } });
    return response(config, processed);
  };
  const saved = await getSavedOriginal(original._id, signal());
  const body = helpers.buildTransformRequest({ ...helpers.createDefaultSettings(), width: "100" });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail("Processing must not download the original");
  try {
    const phases = [];
    const result = await processStudioSource({ kind: "saved", original: saved }, body, signal(), {
      onOriginal() { assert.fail("Saved originals must not be uploaded"); }, onPhase: (phase) => phases.push(phase),
    });
    assert.deepEqual(phases, ["processing"]);
    assert.deepEqual(paths, [["get", `/api/images/${original._id}`], ["post", `/api/images/${original._id}/transform`]]);
    assert.equal(result.originalImageId, original._id);
    assert.equal(result.isFavorite, false);
    assert.equal(favoriteState.getSnapshot().values.get(original._id).value, true);
    assert.equal(result.filename, "version.webp");
    assert.equal(result.format, "webp");
    assert.equal(result.originalName, "photo.png");
    assert.equal(history.groupImagesByOriginal([result, saved])[0].versions[0]._id, result._id);
  } finally { globalThis.fetch = oldFetch; }
});

test("new-file workflow uploads once and reuses the saved original after a failed transformation", async () => {
  const paths = [];
  let saved;
  let fail = true;
  apiClient.defaults.adapter = async (config) => {
    paths.push(config.url);
    if (config.url.endsWith("/upload")) {
      assert.ok(config.data instanceof FormData);
      return response(config, original);
    }
    if (fail) throw httpError(502, config);
    return response(config, processed);
  };
  const body = helpers.buildTransformRequest(helpers.createDefaultSettings());
  await assert.rejects(processStudioSource({ kind: "file", file: png(), original: null }, body, signal(), { ...callbacks, onOriginal: (image) => { saved = image; } }));
  assert.equal(saved._id, original._id);
  fail = false;
  await processStudioSource({ kind: "file", file: png(), original: saved }, body, signal(), callbacks);
  assert.deepEqual(paths, ["/api/images/upload", `/api/images/${original._id}/transform`, `/api/images/${original._id}/transform`]);
});

test("saved links reject malformed IDs, versions and legacy records before processing", async () => {
  apiClient.defaults.adapter = async () => assert.fail("Invalid original reached transport");
  for (const id of ["", "invalid", "../upload"]) await assert.rejects(getSavedOriginal(id, signal()), /link is invalid/);
  const body = helpers.buildTransformRequest(helpers.createDefaultSettings());
  for (const image of [processed, legacy]) {
    await assert.rejects(processStudioSource({ kind: "saved", original: image }, body, signal(), callbacks), /not a saved original/);
    apiClient.defaults.adapter = async (config) => response(config, image);
    await assert.rejects(getSavedOriginal(image._id, signal()), /not a saved original/);
    apiClient.defaults.adapter = async () => assert.fail("Invalid original reached transport");
  }
});

test("saved originals preserve unavailable, forbidden, expired-session and cancellation behavior", async () => {
  for (const status of [403, 404, 401, 502]) {
    tokenStorage.setToken("saved-original-token");
    apiClient.defaults.adapter = async (config) => { throw httpError(status, config); };
    await assert.rejects(getSavedOriginal(original._id, signal()), (error) => error.response.status === status);
    if (status === 401) assert.equal(tokenStorage.getToken(), null);
    assert.doesNotMatch(getImageErrorMessage(httpError(status), "load"), /password|secret/);
  }
  const controller = new AbortController();
  controller.abort();
  apiClient.defaults.adapter = async () => assert.fail("Canceled operation reached transport");
  await assert.rejects(getSavedOriginal(original._id, controller.signal));
  await assert.rejects(processStudioSource({ kind: "saved", original }, helpers.buildTransformRequest(helpers.createDefaultSettings()), controller.signal, callbacks));
});

test("direct Studio URLs render saved mode, and switching to upload removes only the source parameter", () => {
  const renderStudio = (url) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, createElement(Studio)));
  for (const url of [`/upload?originalId=${original._id}`, `/upload?originalId=`]) {
    const markup = renderStudio(url);
    assert.match(markup, /Editing a saved original/);
    assert.match(markup, /Loading saved original/);
    assert.match(markup, /Upload a new image/);
    assert.doesNotMatch(markup, /type="file"/);
  }
  const params = new URLSearchParams(`originalId=${original._id}&source=history`);
  const next = reprocessing.withoutSavedOriginal(params);
  assert.equal(next.toString(), "source=history");
  assert.equal(params.get("originalId"), original._id);
  const upload = renderStudio(`/upload?${next}`);
  assert.match(upload, /type="file"/);
  assert.doesNotMatch(upload, /Editing a saved original/);
});

test("saved preview shows metadata, unavailable state and manual retry without invented dimensions", () => {
  const props = { original, preview: null, loading: false, previewLoading: false, error: "", previewError: "Preview unavailable. Retry to enable cropping.", disabled: false, onRetry() {} };
  const markup = renderToStaticMarkup(createElement(SavedOriginalPreview, props));
  assert.match(markup, /SAVED ORIGINAL/);
  assert.match(markup, /photo.png/);
  assert.match(markup, /Refresh preview/);
  assert.match(markup, /Retry to enable cropping/);
  assert.doesNotMatch(markup, /<img/);
  const unavailable = renderToStaticMarkup(createElement(SavedOriginalPreview, { ...props, original: null, previewError: "", error: "This image is no longer available." }));
  assert.match(unavailable, /role="alert"/);
  assert.match(unavailable, /Retry loading original/);
});

test("saved preview reads signed bytes only for the crop editor without credentials or creating a File", async () => {
  const oldFetch = globalThis.fetch;
  const oldImage = globalThis.Image;
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  const revoked = [];
  let previewBlob;
  URL.createObjectURL = (blob) => { previewBlob = blob; return "blob:saved-preview"; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.Image = class { naturalWidth = 1200; naturalHeight = 800; async decode() {} };
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, original.url);
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.headers, undefined);
    assert.equal(options.signal, controller.signal);
    return new Response(pngBytes, { status: 200 });
  };
  try {
    const preview = await loadSavedImagePreview(original, controller.signal);
    assert.equal(preview.file, undefined);
    assert.ok(previewBlob instanceof Blob);
    assert.equal(previewBlob instanceof File, false);
    assert.deepEqual({ width: preview.width, height: preview.height }, { width: 1200, height: 800 });
    const settings = { ...helpers.createDefaultSettings(), cropEnabled: true, cropWidth: "100", cropHeight: "100", cropX: "1150", cropY: "0" };
    assert.throws(() => helpers.buildTransformRequest(settings, preview), /crop must fit/);
    globalThis.Image = class { naturalWidth = 1200; naturalHeight = 800; async decode() { controller.abort(); } };
    await assert.rejects(loadSavedImagePreview(original, controller.signal));
    assert.deepEqual(revoked, ["blob:saved-preview"], "Late decoded previews are disposed after leaving the workspace");
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.Image = oldImage;
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  }
});

test("expired or failed saved previews do not automatically retry signed storage requests", async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 403 }); };
  try {
    await assert.rejects(loadSavedImagePreview({ ...original, urlExpiresAt: "2020-01-01T00:00:00Z" }, signal()), /expired/);
    assert.equal(calls, 0);
    await assert.rejects(loadSavedImagePreview(original, signal()), /could not be loaded/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test("result identifies the output filename separately from its original and sets the download hint", () => {
  const markup = renderToStaticMarkup(createElement(ProcessingResult, { image: processed, refreshing: false, onRefresh() {}, onReset() {} }));
  assert.match(markup, /PROCESSED FILE/);
  assert.match(markup, /photo.webp/);
  assert.match(markup, /Source original: photo.png/);
  assert.match(markup, /download="photo.webp"/);
  assert.match(markup, /WEBP/);
  assert.match(markup, /20 × 10 px/);
});


test("processed filenames preserve the basename and use actual output metadata without mutating records", () => {
  for (const [name, basename] of [
    ["photo.jpg", "photo"], ["photo.JPEG", "photo"], ["photo.PNG", "photo"],
    ["photo.WEBP", "photo"], ["my.photo.final.JPG", "my.photo.final"],
    ["photo", "photo"], [".photo", ".photo"], ["photo.", "photo"],
    ["მთა holiday.jpg", "მთა holiday"],
  ]) {
    for (const [format, extension] of [["jpeg", "jpg"], ["png", "png"], ["webp", "webp"]]) {
      const image = Object.freeze({ ...processed, originalName: name, format, transformations: { format: "png" } });
      assert.equal(imageFilename(image), `${basename}.${extension}`);
      assert.equal(image.originalName, name);
      assert.equal(image.filename, "version.webp");
      assert.equal(imageFilename({ ...image, kind: "original" }), name);
      assert.equal(imageFilename({ ...image, kind: undefined }), name);
    }
  }
});

test("JPEG originals and WebP versions have consistent names across cards, version lists, and Studio", () => {
  const source = { ...original, originalName: "photo.jpg", format: "jpeg" };
  // Deliberately stale storage filename and transformation metadata must not determine the title.
  const version = { ...processed, originalName: "photo.jpg", filename: "uuid.jpg", transformations: { format: "jpeg" } };
  const renderGroup = (images) => renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(ImageGroupCard, { group: history.groupImagesByOriginal(images)[0], deleteDisabled: false, onDelete() {} })));
  const grouped = renderGroup([source, version]);
  assert.match(grouped, /<h3[^>]*>photo.jpg<\/h3>/);
  assert.match(grouped, /<h3[^>]*>photo.webp<\/h3>/);
  assert.match(grouped, /JPEG/);
  assert.match(grouped, /WEBP/);
  assert.match(renderGroup([version]), /<h3[^>]*>photo.webp<\/h3>/);
  const result = renderToStaticMarkup(createElement(ProcessingResult, { image: version, refreshing: false, onRefresh() {}, onReset() {} }));
  assert.match(result, />photo.webp<\/p>/);
  assert.match(result, /Source original: photo.jpg/);
  assert.match(result, /download="photo.webp"/);
  assert.doesNotMatch(result, /uuid.jpg/);
  const dialog = renderToStaticMarkup(createElement(DeleteImageDialog, { image: version, pending: false, error: null, onCancel() {}, onConfirm() {}, onRefresh() {} }));
  assert.match(dialog, />photo.webp<\/p>/);
  assert.match(renderToStaticMarkup(createElement(FavoriteButton, { image: version })), /favorites: photo.webp/);
});
