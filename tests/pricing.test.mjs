import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  logLevel: "error",
});
after(() => vite.close());

const { default: Pricing } = await vite.ssrLoadModule("/src/pages/Pricing.tsx");
const { AuthContext } = await vite.ssrLoadModule("/src/auth/AuthContext.ts");
const {
  PRICING_COUNTDOWN_SECONDS, safePricingReturnTo, pricingReturnFromState,
  pricingLinkState, startPricingCountdown,
} = await vite.ssrLoadModule("/src/utils/pricing.ts");

function renderPricing(isAuthenticated = false) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/pricing"] },
    createElement(AuthContext.Provider, { value: { isAuthenticated } }, createElement(Pricing)),
  ));
}

test("renders the editorial free pricing page with one plan and supported features", () => {
  const html = renderPricing();
  assert.match(html, /<h1[^>]*>Simple pricing\.<\/h1>/);
  assert.match(html, /Just kidding\./);
  assert.match(html, /It&#x27;s free\./);
  assert.equal((html.match(/\$0/g) ?? []).length, 1);
  assert.match(html, /No credit card\. No mysterious &quot;Pro&quot; tier\./);
  for (const feature of ["Image uploads", "Resize and crop", "Rotate, flip, and mirror", "Grayscale and sepia filters", "JPEG, PNG, and WebP output", "Image history", "Original image preservation", "Multiple transformed versions"]) {
    assert.ok(html.includes(feature), feature);
  }
  assert.doesNotMatch(html, /unlimited|checkout|subscribe/i);
});

test("initial countdown displays five with a keyboard accessible cancel button", () => {
  const html = renderPricing();
  assert.equal(PRICING_COUNTDOWN_SECONDS, 5);
  assert.match(html, /Taking you back in <span[^>]*>5<\/span>\.\.\./);
  assert.match(html, /<button type="button"[^>]*>Stay here<\/button>/);
  assert.match(html, /aria-live="off"/);
  assert.match(html, /motion-safe:transition-transform/);
});

test("signed-in Start processing goes to the existing upload route", () => {
  assert.match(renderPricing(true), /<a[^>]*href="\/upload"[^>]*>Start processing/);
});

test("signed-out Start processing uses the existing login flow", () => {
  assert.match(renderPricing(false), /<a[^>]*href="\/login"[^>]*>Start processing/);
});

test("countdown decreases once per second and completes once after five seconds", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const ticks = [];
  let completed = 0;
  const cancel = startPricingCountdown((value) => ticks.push(value), () => completed++);
  t.after(cancel);
  t.mock.timers.tick(999);
  assert.deepEqual(ticks, []);
  for (let second = 0; second < 4; second++) {
    t.mock.timers.tick(second === 0 ? 1 : 1000);
    assert.equal(ticks.at(-1), 4 - second);
    assert.equal(completed, 0);
  }
  t.mock.timers.tick(1000);
  assert.deepEqual(ticks, [4, 3, 2, 1]);
  assert.equal(completed, 1);
  t.mock.timers.tick(10000);
  assert.equal(completed, 1);
});

test("Stay here's cancellation stops both ticks and automatic return", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const ticks = [];
  let completed = false;
  const cancel = startPricingCountdown((value) => ticks.push(value), () => { completed = true; });
  t.mock.timers.tick(1000);
  cancel();
  t.mock.timers.tick(10000);
  assert.deepEqual(ticks, [4]);
  assert.equal(completed, false);
});

test("effect cleanup prevents callbacks after unmount, including repeated cleanup", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const unexpected = () => assert.fail("A cleaned-up timer must not call React or navigate");
  const cleanup = startPricingCountdown(unexpected, unexpected);
  cleanup();
  cleanup();
  t.mock.timers.tick(10000);
});

test("Strict Mode setup / cleanup / setup leaves only one active countdown", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  startPricingCountdown(() => assert.fail("Old tick"), () => assert.fail("Old redirect"))();
  const ticks = [];
  let completed = 0;
  const cleanup = startPricingCountdown((value) => ticks.push(value), () => completed++);
  t.after(cleanup);
  for (let second = 0; second < 5; second++) t.mock.timers.tick(1000);
  assert.deepEqual(ticks, [4, 3, 2, 1]);
  assert.equal(completed, 1);
});

test("safe return preserves internal pathname, query, and fragment", () => {
  assert.equal(safePricingReturnTo("/images?page=2#versions"), "/images?page=2#versions");
  for (const path of ["/", "/dashboard", "/upload", "/images", "/studio", "/history", "/login", "/register"]) {
    assert.equal(safePricingReturnTo(path), path);
  }
});

test("external, malformed, unknown, and Pricing destinations fall back to home", () => {
  for (const value of [undefined, null, {}, 1, "", "images", "https://example.com", "//example.com/upload", "/\\example.com/upload", "/\n/example.com", "/pricing", "/PRICING/", "/pricing?returnTo=/images", "/images/../pricing", "/%70ricing", "/missing"]) {
    assert.equal(safePricingReturnTo(value), "/", String(value));
  }
  for (const state of [undefined, null, "bad", {}, { returnTo: "https://example.com" }]) {
    assert.equal(pricingReturnFromState(state), "/");
  }
});

test("Pricing links carry the originating location, and repeated clicks preserve it", () => {
  const state = pricingLinkState({ pathname: "/images", search: "?page=2", hash: "#versions", state: null });
  assert.deepEqual(state, { returnTo: "/images?page=2#versions" });
  assert.deepEqual(pricingLinkState({ pathname: "/pricing", search: "", hash: "", state }), state);
  assert.deepEqual(pricingLinkState({ pathname: "/Pricing/", search: "", hash: "", state: { returnTo: "/pricing" } }), { returnTo: "/" });
});

test("countdown returns through React Router and replaces Pricing to prevent a back loop", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const router = createMemoryRouter([{ path: "*", element: null }], { initialEntries: ["/upload", "/images?page=2#versions"] });
  t.after(() => router.dispose());
  await router.navigate("/pricing", { state: pricingLinkState(router.state.location) });
  const returnTo = pricingReturnFromState(router.state.location.state);
  let navigation;
  const cancel = startPricingCountdown(() => {}, () => { navigation = router.navigate(returnTo, { replace: true }); });
  t.after(cancel);
  for (let second = 0; second < 5; second++) t.mock.timers.tick(1000);
  await navigation;
  assert.equal(router.state.location.pathname, "/images");
  assert.equal(router.state.location.search, "?page=2");
  assert.equal(router.state.location.hash, "#versions");
  await router.navigate(-1);
  assert.equal(router.state.location.pathname, "/images");
});

test("direct Pricing entry returns home without inspecting external browser history", async (t) => {
  const router = createMemoryRouter([{ path: "*", element: null }], { initialEntries: ["/pricing"] });
  t.after(() => router.dispose());
  await router.navigate(pricingReturnFromState(router.state.location.state), { replace: true });
  assert.equal(router.state.location.pathname, "/");
});
