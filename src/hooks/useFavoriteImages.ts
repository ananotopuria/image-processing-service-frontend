import { useEffect, useState } from "react";
import { getFavoriteImages } from "../api/images";
import { getImageErrorMessage } from "../api/imageErrors";
import type { PaginatedImagesResponse } from "../api/images.types";
import { validHistoryPage } from "../utils/imageHistory";
import { favoriteState } from "../utils/favorites";
import { useFavorites } from "./useFavorites";

type Result = { key: string; page: number; data: PaginatedImagesResponse | null; error: string | null };

export function useFavoriteImages(enabled: boolean) {
  const [page, setPage] = useState(1);
  const [refreshCount, setRefreshCount] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const favorites = useFavorites();
  const key = `${page}:${refreshCount}:${favorites.revision}`;
  useEffect(() => {
    if (!enabled || favorites.pending) return;
    const controller = new AbortController();
    const ticket = favoriteState.read();
    getFavoriteImages(page, 10, controller.signal).then((data) => {
      if (controller.signal.aborted || !favoriteState.current(ticket) || favoriteState.getSnapshot().revision !== ticket.revision) return;
      const correctedPage = validHistoryPage(data);
      if (correctedPage !== page) { setPage(correctedPage); return; }
      setResult({ key, page, data, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && favoriteState.current(ticket)) {
        setResult((previous) => ({ key, page, data: previous?.page === page ? previous.data : null, error: getImageErrorMessage(error, "load") }));
      }
    });
    return () => controller.abort();
  }, [enabled, page, key, favorites.pending]);

  const data = result?.page === page ? result.data : null;
  const items = data?.items.filter((image) => favorites.values.get(image._id)?.value ?? image.isFavorite) ?? [];
  return {
    data: data ? { ...data, items } : null,
    loading: enabled && !favorites.pending && result?.key !== key,
    error: result?.key === key ? result.error : null,
    setPage,
    refresh: () => setRefreshCount((value) => value + 1),
  };
}
