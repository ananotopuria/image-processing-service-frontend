import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, logLevel: "error" });
after(() => vite.close());
const { default: Pricing } = await vite.ssrLoadModule("/src/pages/Pricing.tsx");
const { default: DemoPlanDialog } = await vite.ssrLoadModule("/src/components/pricing/DemoPlanDialog.tsx");
const { activateModal } = await vite.ssrLoadModule("/src/utils/modal.ts");
const { authDestination } = await vite.ssrLoadModule("/src/auth/destination.ts");
const render = (component, props = {}) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/pricing"] }, createElement(component, props)));

test("renders three illustrative plans with the requested copy, prices, quotas and shared features", () => {
  const html = render(Pricing);
  assert.match(html, /<h1[^>]*>A little plan for every imagination\.<\/h1>/);
  assert.match(html, /Choose your creative ambitions\. We’ll take care of the pixels\./);
  assert.equal((html.match(/<article /g) ?? []).length, 3);
  for (const [name, price, quota] of [["Starter", "0", "10"], ["Creator", "9", "100"], ["Studio", "19", "Unlimited"]]) {
    assert.match(html, new RegExp(`<h2[^>]*>${name}</h2>`));
    assert.ok(html.includes(`$${price}</span>`));
    assert.ok(html.includes(`${quota} image uploads`));
  }
  assert.equal((html.match(/\/ month/g) ?? []).length, 2);
  for (const feature of ["All image transformations", "Original image storage", "Download processed images"]) {
    assert.equal(html.split(feature).length - 1, 3);
  }
  assert.ok(html.includes("Demo plans — no payment required. All features are free; the upload quotas above are illustrative."));
  assert.match(html, /md:grid-cols-3/);
  assert.match(html, /motion-safe:hover:-translate-y-1/);
});

test("only Creator is marked Most popular and both paid-looking buttons open a dialog", () => {
  const html = render(Pricing);
  const articles = html.match(/<article\b[\s\S]*?<\/article>/g);
  assert.doesNotMatch(articles[0], /Most popular/);
  assert.match(articles[1], /Most popular/);
  assert.doesNotMatch(articles[2], /Most popular/);
  for (const name of ["Creator", "Studio"]) {
    assert.match(html, new RegExp(`<button[^>]*aria-haspopup="dialog"[^>]*>Get ${name}`));
  }
  assert.doesNotMatch(html, /<dialog|countdown|Taking you back|Stay here|Start processing/i);
});

test("Starter and the modal primary action target the actual protected History route", () => {
  assert.match(render(Pricing), /<a[^>]*href="\/images"[^>]*>Start creating/);
  const html = render(DemoPlanDialog, { onClose() {} });
  assert.match(html, /<a[^>]*href="\/images"[^>]*>Take me to History →<\/a>/);
  assert.doesNotMatch(html, /href="\/(upload|studio)"/);
});

test("the styled native modal has a labelled title, description and visible close control", () => {
  const html = render(DemoPlanDialog, { onClose() {} });
  assert.match(html, /<dialog[^>]*aria-labelledby="pricing-dialog-title"[^>]*aria-describedby="pricing-dialog-description"/);
  assert.match(html, /id="pricing-dialog-title"[^>]*>Your money is safe\./);
  assert.ok(html.includes("Just kidding — this is a portfolio project. All features are free. Go make something beautiful."));
  assert.match(html, /<button[^>]*aria-label="Close dialog"/);
  assert.match(html, /backdrop:bg-ink\/60/);
});

test("post-login History intent is narrowly validated and ordinary sign-ins still use Dashboard", () => {
  assert.equal(authDestination({ returnTo: "/images" }), "/images");
  for (const state of [undefined, null, {}, { returnTo: "https://example.com" }, { returnTo: "//example.com" }, { returnTo: "/upload" }, { returnTo: "/images/../upload" }, { returnTo: "/login" }, { returnTo: "/images?next=https://example.com" }]) {
    assert.equal(authDestination(state), "/dashboard");
  }
});

function modalEnvironment(t) {
  const savedDocument = globalThis.document;
  const savedElement = globalThis.HTMLElement;
  class Control {
    isConnected = true;
    focus() { globalThis.document.activeElement = this; }
  }
  const trigger = new Control();
  const close = new Control();
  const link = new Control();
  globalThis.HTMLElement = Control;
  globalThis.document = { activeElement: trigger, body: { style: { overflow: "auto" } }, documentElement: { style: { overflow: "scroll" } } };
  class Dialog extends EventTarget {
    open = false;
    showModal() { this.open = true; }
    close() { this.open = false; }
    querySelectorAll() { return [close, link]; }
  }
  t.after(() => {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    if (savedElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = savedElement;
  });
  return { dialog: new Dialog(), trigger, close, link };
}
function key(dialog, value, shiftKey = false) {
  const event = new Event("keydown", { cancelable: true });
  Object.assign(event, { key: value, shiftKey });
  dialog.dispatchEvent(event);
  return event;
}

test("modal locks background scrolling, wraps Tab in both directions, and restores focus/styles", (t) => {
  const { dialog, trigger, close, link } = modalEnvironment(t);
  const cleanup = activateModal(dialog, close);
  assert.equal(dialog.open, true);
  assert.equal(document.activeElement, close);
  assert.equal(document.body.style.overflow, "hidden");
  assert.equal(document.documentElement.style.overflow, "hidden");
  assert.equal(key(dialog, "Tab", true).defaultPrevented, true);
  assert.equal(document.activeElement, link);
  assert.equal(key(dialog, "Tab").defaultPrevented, true);
  assert.equal(document.activeElement, close);
  assert.equal(key(dialog, "Tab").defaultPrevented, false, "Interior navigation remains native");
  assert.equal(key(dialog, "Escape").defaultPrevented, false, "Escape reaches native dialog cancellation");
  cleanup();
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, "auto");
  assert.equal(document.documentElement.style.overflow, "scroll");
  close.focus();
  assert.equal(key(dialog, "Tab", true).defaultPrevented, false, "Cleanup removes the keyboard listener");
});

test("Strict Mode modal setup/cleanup/setup keeps the correct focus and scroll state", (t) => {
  const { dialog, trigger, close } = modalEnvironment(t);
  activateModal(dialog, close)();
  const cleanup = activateModal(dialog, close);
  assert.equal(dialog.open, true);
  assert.equal(document.body.style.overflow, "hidden");
  cleanup();
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, "auto");
});

test("navigation cleanup does not focus a disconnected pricing button", (t) => {
  const { dialog, trigger, close } = modalEnvironment(t);
  const cleanup = activateModal(dialog, close);
  trigger.isConnected = false;
  cleanup();
  assert.equal(document.activeElement, close);
  assert.equal(document.documentElement.style.overflow, "scroll");
});


test("pointer-opened modals restore the actual plan button even when the browser did not focus it", (t) => {
  const { dialog, trigger, close, link } = modalEnvironment(t);
  document.activeElement = link;
  const cleanup = activateModal(dialog, close, trigger);
  cleanup();
  assert.equal(document.activeElement, trigger);
});
