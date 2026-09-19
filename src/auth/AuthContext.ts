import { createContext } from "react";
import type { SessionUser, SignInPayload, SignUpPayload } from "../api/auth.types";

export interface AuthContextValue {
  user: SessionUser | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  sessionError: string | null;
  login: (payload: SignInPayload, signal: AbortSignal) => Promise<void>;
  register: (payload: SignUpPayload, signal: AbortSignal) => Promise<void>;
  logout: () => void;
  retrySession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
