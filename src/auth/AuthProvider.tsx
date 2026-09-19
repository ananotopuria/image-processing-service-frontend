import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getProfile, signIn, signUp } from "../api/auth";
import type { AuthResponse, SignInPayload, SignUpPayload } from "../api/auth.types";
import { getAuthErrorMessage } from "../api/errors";
import { AuthContext } from "./AuthContext";
import { tokenStorage } from "./tokenStorage";
import { sessionFromAuth, sessionFromProfile, type Session } from "./session";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const subscribe = useCallback((onStoreChange: () => void) =>
    tokenStorage.subscribe(() => {
      // Logout, rejected tokens, and other tabs also clear in-memory user data.
      setSession(null);
      onStoreChange();
    }), []);
  const token = useSyncExternalStore(subscribe, tokenStorage.getToken, () => null);

  useEffect(() => {
    if (!token || session?.token === token) return;
    const controller = new AbortController();

    getProfile(controller.signal)
      .then((profile) => {
        if (!controller.signal.aborted && tokenStorage.getToken() === token) {
          setSession(sessionFromProfile(token, profile));
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && tokenStorage.getToken() === token) {
          setSession({ token, user: null, error: getAuthErrorMessage(error) });
        }
      });

    return () => controller.abort();
  }, [token, session]);

  function establishSession(response: AuthResponse, signal: AbortSignal) {
    if (signal.aborted) return;
    tokenStorage.setToken(response.accessToken);
    setSession(sessionFromAuth(response));
  }

  async function login(payload: SignInPayload, signal: AbortSignal) {
    establishSession(await signIn(payload, signal), signal);
  }

  async function register(payload: SignUpPayload, signal: AbortSignal) {
    establishSession(await signUp(payload, signal), signal);
  }

  function logout() {
    tokenStorage.clearToken();
    setSession(null);
  }

  const hasCheckedSession = Boolean(token && session?.token === token);

  return (
    <AuthContext.Provider value={{
      user: hasCheckedSession ? session?.user ?? null : null,
      isAuthenticated: hasCheckedSession && !session?.error,
      isRestoring: Boolean(token && !hasCheckedSession),
      sessionError: hasCheckedSession ? session?.error ?? null : null,
      login,
      register,
      logout,
      retrySession: () => setSession(null),
    }}>
      {children}
    </AuthContext.Provider>
  );
}
