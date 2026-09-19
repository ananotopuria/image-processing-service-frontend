export function resolveApiUrl(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(
      "VITE_API_URL is missing. Set the backend origin in .env (see .env.example) and restart Vite. For deployment, set it before building.",
    );
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("VITE_API_URL must be an absolute HTTP or HTTPS backend origin.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/"
  ) {
    throw new Error(
      "VITE_API_URL must be an HTTP or HTTPS origin without credentials, a path, query, or fragment. Do not append /api.",
    );
  }

  return url.origin;
}
