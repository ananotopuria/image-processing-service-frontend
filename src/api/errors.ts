import axios from "axios";

// Only errors deliberately written for the UI may expose their message directly.
export class AuthError extends Error {}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (!axios.isAxiosError<{ message?: unknown }>(error)) {
    return "Something went wrong. Please try again.";
  }
  if (!error.response) {
    return error.code === "ECONNABORTED" || error.code === "ETIMEDOUT"
      ? "The server took too long to respond. Please try again."
      : "We could not reach the server. Check your connection and try again.";
  }

  const { status, data } = error.response;
  if (status === 401) return "Invalid email or password. Please try again.";
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (status >= 500) return "The server is unavailable right now. Please try again later.";

  // NestJS returns a string for service errors and an array for DTO validation.
  // Allow only known public messages, never arbitrary server internals or traces.
  const rawMessage: unknown = data && typeof data === "object" ? data.message : undefined;
  const messages = Array.isArray(rawMessage) ? rawMessage : [rawMessage];
  const safeMessages = messages.filter((message): message is string =>
    typeof message === "string" && (
      /^A user with this (email|username) already exists\.?$/.test(message) ||
      /^(username|email|password) (must be an email|must be a string|must be longer than or equal to \d+ characters|must be shorter than or equal to \d+ characters)$/.test(message)
    ),
  );
  if ((status === 400 || status === 409) && safeMessages.length) {
    return [...new Set(safeMessages)].join(" ");
  }
  if (status === 409) return "An account with these details already exists. Try signing in.";
  if (status === 400) return "Please check your details and try again.";
  return "We could not complete this request. Please try again.";
}
