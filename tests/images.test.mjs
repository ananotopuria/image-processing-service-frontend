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
