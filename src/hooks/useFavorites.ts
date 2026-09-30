import { useEffect, useState, useSyncExternalStore } from "react";
import { setImageFavorite } from "../api/images";
import { getImageErrorMessage } from "../api/imageErrors";
import type { ImageMetadata } from "../api/images.types";
import { favoriteState } from "../utils/favorites";

export function useFavorites() {
  const state = useSyncExternalStore(favoriteState.subscribe, favoriteState.getSnapshot, favoriteState.getSnapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = state.retryAt - Date.now();
    if (!state.retryAt) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(delay + 1, 2147483647)));
    return () => window.clearTimeout(timer);
  }, [state.retryAt]);
  return { ...state, rateLimited: state.retryAt > now };
}

export async function toggleFavorite(image: ImageMetadata) {
  const request = favoriteState.begin(image);
  if (!request) return;
  try {
    const response = await setImageFavorite(image._id, request.value, request.controller.signal);
    favoriteState.finish(request, response.isFavorite);
  } catch (error) {
    favoriteState.finish(request, request.previous, getImageErrorMessage(error, "favorite"));
  }
}
