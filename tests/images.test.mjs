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
const { createUploadFormData, uploadImage, transformImage, refreshImageLinks } = await vite.ssrLoadModule("/src/api/images.ts");
const { apiClient } = await vite.ssrLoadModule("/src/api/client.ts");
const { tokenStorage } = await vite.ssrLoadModule("/src/auth/tokenStorage.ts");
const { getImageErrorMessage } = await vite.ssrLoadModule("/src/api/imageErrors.ts");
const { default: ProcessingResult } = await vite.ssrLoadModule("/src/components/images/ProcessingResult.tsx");

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
