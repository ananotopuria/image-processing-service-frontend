import { useEffect, useState } from "react";
import { getImages } from "../api/images";
import { getImageErrorMessage } from "../api/imageErrors";
import type { PaginatedImagesResponse } from "../api/images.types";
import { validHistoryPage } from "../utils/imageHistory";

interface PageResult {
  requestKey: string;
  data: PaginatedImagesResponse | null;
  error: string | null;
}

export function useImageHistory(limit = 10) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<PageResult | null>(null);
  const requestKey = `${page}:${limit}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    getImages(page, limit, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      const correctedPage = validHistoryPage(data);
      if (correctedPage !== page) { setPage(correctedPage); return; }
      setResult({ requestKey, data, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setResult((previous) => ({ requestKey, data: previous?.data ?? null, error: getImageErrorMessage(error, "load") }));
      }
    });
    return () => controller.abort();
  }, [page, limit, requestKey]);

  return {
    data: result?.data ?? null,
    loading: result?.requestKey !== requestKey,
    error: result?.requestKey === requestKey ? result.error : null,
    setPage: (nextPage: number) => {
      setPage(nextPage);
      // A failed navigation may already target this page while older records are
      // still visible. Give another click a new request rather than doing nothing.
      setRevision((value) => value + 1);
    },
    refresh: () => setRevision((value) => value + 1),
  };
}
