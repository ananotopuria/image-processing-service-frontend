import { AuthError } from "../api/errors";

const TOKEN_KEY = "mothframe_access_token";
const listeners = new Set<() => void>();

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

let token = readStoredToken();

function publish(nextToken: string | null) {
  token = nextToken;
  listeners.forEach((listener) => listener());
}

export const tokenStorage = {
  getToken: () => token,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  setToken(nextToken: string) {
    try {
      window.localStorage.setItem(TOKEN_KEY, nextToken);
    } catch {
      throw new AuthError(
        "Your browser could not save this session. Allow site storage, then sign in again.",
      );
    }
    publish(nextToken);
  },
  clearToken() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } finally {
      publish(null);
    }
  },
};

// Keep an already-open tab in sync when another tab signs in or out.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === TOKEN_KEY || event.key === null) {
      publish(readStoredToken());
    }
  });
}
