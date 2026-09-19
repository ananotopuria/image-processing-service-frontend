import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { AxiosError, AxiosHeaders } from "axios";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Test-only storage and transport. No running backend, accounts, or real JWTs.
const stored = new Map([["mothframe_access_token", "stored-test-token"]]);
const events = new EventTarget();
globalThis.window = {
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  },
  addEventListener: events.addEventListener.bind(events),
};
process.env.VITE_API_URL = "https://api.example.test";
const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  logLevel: "error",
});
const { tokenStorage } = await vite.ssrLoadModule("/src/auth/tokenStorage.ts");
const restoredToken = tokenStorage.getToken();
const { apiClient } = await vite.ssrLoadModule("/src/api/client.ts");
const { signIn, signUp, getProfile } = await vite.ssrLoadModule("/src/api/auth.ts");
const { resolveApiUrl } = await vite.ssrLoadModule("/src/api/config.ts");
const { getAuthErrorMessage } = await vite.ssrLoadModule("/src/api/errors.ts");
const { AuthContext } = await vite.ssrLoadModule("/src/auth/AuthContext.ts");
const { sessionFromAuth, sessionFromProfile } = await vite.ssrLoadModule("/src/auth/session.ts");
const { default: ProtectedRoute } = await vite.ssrLoadModule("/src/auth/ProtectedRoute.tsx");

after(async () => {
  await vite.close();
  delete globalThis.window;
});
beforeEach(() => tokenStorage.clearToken());

function response(config, data, status = 200) {
  return { config, data, status, statusText: "", headers: new AxiosHeaders() };
}

function httpError(status, data = {}, config = { headers: new AxiosHeaders() }) {
  return new AxiosError("Raw transport details", undefined, config, undefined, response(config, data, status));
}

const authResponse = {
  message: "Signed in successfully",
  accessToken: "response-test-token",
  user: { id: "test-user", username: "reader", email: "reader@example.test" },
};

test("requires an HTTP(S) origin and rejects missing or misleading configuration", () => {
  assert.equal(resolveApiUrl(" https://api.example.test/ "), "https://api.example.test");
  for (const value of [undefined, "", "/api", "file:///tmp/api", "https://api.example.test/api", "https://user:password@api.example.test"]) {
    assert.throws(() => resolveApiUrl(value), /VITE_API_URL/);
  }
});

test("restores the stored token without decoding its claims", () => {
  assert.equal(restoredToken, "stored-test-token");
});

test("keeps the returned account in memory after either auth response", () => {
  const session = sessionFromAuth(authResponse);
  assert.deepEqual(session.user, authResponse.user);
  assert.equal(session.token, authResponse.accessToken);
  assert.equal(session.error, null);
  assert.equal(stored.size, 0);
});

test("restores identity from verified profile claims without inventing a username", () => {
  const session = sessionFromProfile("stored-test-token", {
    user: { sub: "test-user", email: "reader@example.test", iat: 1789646400, exp: 1789650000 },
  });
  assert.deepEqual(session.user, { id: "test-user", email: "reader@example.test" });
  assert.equal("username" in session.user, false);
  assert.equal(session.error, null);
  assert.equal(stored.size, 0);
});

test("persists a session, notifies React subscribers, and clears it on logout", () => {
  let updates = 0;
  const unsubscribe = tokenStorage.subscribe(() => updates++);
  tokenStorage.setToken("session-test-token");
  assert.equal(stored.get("mothframe_access_token"), "session-test-token");
  assert.equal(tokenStorage.getToken(), "session-test-token");
  tokenStorage.clearToken();
  assert.equal(tokenStorage.getToken(), null);
  assert.equal(stored.has("mothframe_access_token"), false);
  assert.equal(updates, 2);
  unsubscribe();
});

test("does not authenticate when persistent storage is unavailable", () => {
  const original = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error("Storage denied"); };
  try {
    assert.throws(() => tokenStorage.setToken("test-token"), /Allow site storage/);
    assert.equal(tokenStorage.getToken(), null);
  } finally {
    window.localStorage.setItem = original;
  }
});

test("observes sign-out from another tab", () => {
  tokenStorage.setToken("test-token");
  stored.delete("mothframe_access_token");
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: "mothframe_access_token" });
  events.dispatchEvent(event);
  assert.equal(tokenStorage.getToken(), null);
});

test("login and registration send the verified DTO fields to the exact endpoints", async () => {
  const calls = [];
  tokenStorage.setToken("previous-test-token");
  apiClient.defaults.adapter = async (config) => {
    calls.push({ url: config.url, payload: JSON.parse(config.data) });
    assert.equal(config.headers.get("Authorization"), undefined);
    assert.equal(config.baseURL, "https://api.example.test");
    return response(config, authResponse);
  };
  const credentials = { email: "reader@example.test", password: "test-password" };
  assert.deepEqual(await signIn(credentials), authResponse);
  assert.deepEqual(await signUp({ ...credentials, username: "reader" }), authResponse);
  assert.deepEqual(calls, [
    { url: "/api/auth/sign-in", payload: credentials },
    { url: "/api/auth/sign-up", payload: { ...credentials, username: "reader" } },
  ]);
});

test("rejects malformed successful responses instead of guessing a token property", async () => {
  for (const data of [null, "<html>Not an API</html>", {}, { ...authResponse, accessToken: "" }, { token: "wrong-field" }]) {
    apiClient.defaults.adapter = async (config) => response(config, data);
    await assert.rejects(signIn({ email: "reader@example.test", password: "test-password" }), /incomplete account response/);
    assert.equal(tokenStorage.getToken(), null);
  }
});

test("attaches the current token to profile and future protected requests", async () => {
  tokenStorage.setToken("current-test-token");
  apiClient.defaults.adapter = async (config) => {
    assert.equal(config.headers.get("Authorization"), "Bearer current-test-token");
    assert.equal(config.url, "/api/auth/profile");
    return response(config, { user: { sub: "test-user", email: "reader@example.test" } });
  };
  await getProfile(new AbortController().signal);
});

test("does not send an Authorization header after logout", async () => {
  tokenStorage.setToken("test-token");
  tokenStorage.clearToken();
  apiClient.defaults.adapter = async (config) => {
    assert.equal(config.headers.get("Authorization"), undefined);
    return response(config, {});
  };
  await apiClient.get("/api/auth/profile");
});

test("rejects alternate origins before authenticated transport", async () => {
  tokenStorage.setToken("test-token");
  apiClient.defaults.adapter = async () => { assert.fail("Transport must not run"); };
  await assert.rejects(apiClient.get("https://elsewhere.example.test/private"), /relative path/);
  await assert.rejects(apiClient.get("//elsewhere.example.test/private"), /relative path/);
  await assert.rejects(apiClient.get("/private", { baseURL: "https://elsewhere.example.test" }), /configured API origin/);
});

test("a protected 401 invalidates the session, but a failed login does not", async () => {
  tokenStorage.setToken("test-token");
  apiClient.defaults.adapter = async (config) => { throw httpError(401, {}, config); };
  await assert.rejects(signIn({ email: "reader@example.test", password: "test-password" }));
  assert.equal(tokenStorage.getToken(), "test-token");
  await assert.rejects(getProfile(new AbortController().signal));
  assert.equal(tokenStorage.getToken(), null);
});

test("a stale request cannot invalidate a newer login", async () => {
  tokenStorage.setToken("old-test-token");
  apiClient.defaults.adapter = async (config) => {
    tokenStorage.setToken("new-test-token");
    throw httpError(401, {}, config);
  };
  await assert.rejects(getProfile(new AbortController().signal));
  assert.equal(tokenStorage.getToken(), "new-test-token");
});

test("network and server failures retain the saved token for retry", async () => {
  tokenStorage.setToken("test-token");
  apiClient.defaults.adapter = async (config) => { throw httpError(503, {}, config); };
  await assert.rejects(getProfile(new AbortController().signal));
  assert.equal(tokenStorage.getToken(), "test-token");
});

test("shows safe validation/conflict errors and conceals internal server details", () => {
  assert.equal(getAuthErrorMessage(httpError(409, { message: "A user with this email already exists" })), "A user with this email already exists");
  assert.match(getAuthErrorMessage(httpError(400, { message: ["email must be an email"] })), /email must be an email/);
  assert.match(getAuthErrorMessage(httpError(401)), /Invalid email or password/);
  assert.match(getAuthErrorMessage(httpError(429)), /Too many attempts/);
  assert.match(getAuthErrorMessage(new AxiosError("internal detail", "ERR_NETWORK")), /could not reach/);
  assert.match(getAuthErrorMessage(new AxiosError("internal detail", "ECONNABORTED")), /too long/);
  for (const status of [400, 409, 500]) {
    assert.doesNotMatch(getAuthErrorMessage(httpError(status, { message: "database password: secret" })), /database|secret/);
  }
});

function renderGuard(state) {
  return renderToStaticMarkup(createElement(AuthContext.Provider, { value: {
    user: null, isAuthenticated: false, isRestoring: false, sessionError: null,
    retrySession() {}, logout() {}, ...state,
  } }, createElement(MemoryRouter, { initialEntries: ["/studio"] },
    createElement(Routes, null,
      createElement(Route, { element: createElement(ProtectedRoute) },
        createElement(Route, { path: "/studio", element: createElement("p", null, "Private studio content") }),
      ),
    ),
  )));
}

test("protected content waits for session verification and offers retry on connection failure", () => {
  assert.match(renderGuard({ isAuthenticated: true }), /Private studio content/);
  const checking = renderGuard({ isRestoring: true });
  assert.match(checking, /Checking your session/);
  assert.doesNotMatch(checking, /Private studio content/);
  const unavailable = renderGuard({ sessionError: "Unable to reach server" });
  assert.match(unavailable, /Try again/);
  assert.doesNotMatch(unavailable, /Private studio content/);
});
