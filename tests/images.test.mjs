import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { AxiosError, AxiosHeaders } from "axios";
import { createServer } from "vite";
import { createElement } from "react";
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
const { createUploadFormData, uploadImage, transformImage, refreshImageLinks, getImageById, getImages, deleteImage } = await vite.ssrLoadModule("/src/api/images.ts");
const history = await vite.ssrLoadModule("/src/utils/imageHistory.ts");
const { apiClient } = await vite.ssrLoadModule("/src/api/client.ts");
const { tokenStorage } = await vite.ssrLoadModule("/src/auth/tokenStorage.ts");
const { getImageErrorMessage } = await vite.ssrLoadModule("/src/api/imageErrors.ts");
const { default: ProcessingResult } = await vite.ssrLoadModule("/src/components/images/ProcessingResult.tsx");
const { default: ImageGroupCard } = await vite.ssrLoadModule("/src/components/images/ImageGroupCard.tsx");
const { default: DeleteImageDialog } = await vite.ssrLoadModule("/src/components/images/DeleteImageDialog.tsx");

after(async () => { await vite.close(); delete globalThis.window; });
beforeEach(() => tokenStorage.clearToken());

const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=", "base64");
const png = () => new File([pngBytes], "photo.png", { type: "image/png" });
const original = {
  _id: "66e83a109af861ce27c86a02", user: "66e83a109af861ce27c86a01", kind: "original",
  originalName: "photo.png", filename: "original.png", format: "png", mimeType: "image/png",
  path: "originals/user/original.png", originalKey: "originals/user/original.png", originalSize: 1000,
  url: "https://storage.example.test/original.png?signature=test",
  downloadUrl: "https://storage.example.test/original.png?attachment=test",
  urlExpiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z",
};
const processed = {
  ...original, _id: "66e83a109af861ce27c86a03", kind: "transformed", originalImageId: original._id,
  format: "webp", filename: "version.webp", path: "transformed/user/original/version.webp",
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
  assert.match(getImageErrorMessage(httpError(429)), /Wait a minute/);
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

test("keeps page-level orphan versions visible and distinguishes unlinked/legacy records", () => {
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
  assert.match(history.imageDeleteMessage(original), /all of its transformed versions, including versions on other pages/);
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
  const markup = renderToStaticMarkup(createElement(ImageGroupCard, { group, deleteDisabled: false, onDelete() {} }));
  for (const text of ["Original", "Processed version", "View versions", "(2)", "on this page", "Image details", "Rotate 90°", "Grayscale", "Quality 90"]) assert.ok(markup.includes(text), text);
  assert.doesNotMatch(markup, /originals\/user\/|transformed\/user\//);
  const orphan = history.groupImagesByOriginal([{ ...processed, url: undefined, downloadUrl: undefined, urlExpiresAt: undefined }])[0];
  const orphanMarkup = renderToStaticMarkup(createElement(ImageGroupCard, { group: orphan, deleteDisabled: false, onDelete() {} }));
  assert.match(orphanMarkup, /original is not on this page/);
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
