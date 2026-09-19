import axios from "axios";
import { tokenStorage } from "../auth/tokenStorage";
import { resolveApiUrl } from "./config";

export const apiClient = axios.create({
  baseURL: resolveApiUrl(import.meta.env.VITE_API_URL),
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  // This client is for relative backend paths only, keeping credentials on that API.
  if (!config.url?.startsWith("/") || config.url.startsWith("//")) {
    throw new Error("API requests must use a relative path beginning with /.");
  }
  if (config.baseURL !== apiClient.defaults.baseURL) {
    throw new Error("Use the configured API origin for authenticated requests.");
  }
  const token = tokenStorage.getToken();
  const isAuthRequest = ["/api/auth/sign-in", "/api/auth/sign-up"].includes(config.url);
  if (token && !isAuthRequest) {
    config.headers.setAuthorization(`Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const token = tokenStorage.getToken();
      // An old in-flight request must not clear a newly established session.
      if (token && error.config?.headers.get("Authorization") === `Bearer ${token}`) {
        tokenStorage.clearToken();
      }
    }
    return Promise.reject(error);
  },
);
