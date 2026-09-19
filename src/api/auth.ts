import { apiClient } from "./client";
import { AuthError } from "./errors";
import type { AuthResponse, ProfileResponse, SignInPayload, SignUpPayload } from "./auth.types";

function assertAuthResponse(data: AuthResponse): AuthResponse {
  if (
    !data || typeof data.accessToken !== "string" || !data.accessToken.trim() ||
    typeof data.message !== "string" || typeof data.user?.id !== "string" ||
    typeof data.user?.email !== "string" || typeof data.user?.username !== "string"
  ) {
    throw new AuthError("The server returned an incomplete account response. Please try signing in again.");
  }
  return data;
}

export async function signIn(payload: SignInPayload, signal?: AbortSignal) {
  const { data } = await apiClient.post<AuthResponse>("/api/auth/sign-in", payload, { signal });
  return assertAuthResponse(data);
}

export async function signUp(payload: SignUpPayload, signal?: AbortSignal) {
  const { data } = await apiClient.post<AuthResponse>("/api/auth/sign-up", payload, { signal });
  return assertAuthResponse(data);
}

export async function getProfile(signal: AbortSignal): Promise<ProfileResponse> {
  const { data } = await apiClient.get<ProfileResponse>("/api/auth/profile", { signal });
  if (!data || typeof data.user?.sub !== "string" || typeof data.user?.email !== "string") {
    throw new AuthError("The server could not confirm your session. Please try again.");
  }
  return data;
}
