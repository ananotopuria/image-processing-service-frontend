import type { AuthResponse, ProfileResponse, SessionUser } from "../api/auth.types";

export type Session =
  | { token: string; user: SessionUser; error: null }
  | { token: string; user: null; error: string };

export function sessionFromAuth(response: AuthResponse): Session {
  return { token: response.accessToken, user: response.user, error: null };
}

export function sessionFromProfile(token: string, response: ProfileResponse): Session {
  return {
    token,
    user: { id: response.user.sub, email: response.user.email },
    error: null,
  };
}
