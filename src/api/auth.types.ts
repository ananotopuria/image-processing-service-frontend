export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload extends SignInPayload {
  username: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

// The profile endpoint supplies ID and email, but no username after refresh.
export type SessionUser = Pick<AuthUser, "id" | "email"> &
  Partial<Pick<AuthUser, "username">>;

export interface AuthResponse {
  message: string;
  accessToken: string;
  user: AuthUser;
}

export interface ProfileClaims {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface ProfileResponse {
  user: ProfileClaims;
}
