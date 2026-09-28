import { useEffect, useState } from "react";
import { getImageArchive } from "../api/images";
import { getImageErrorMessage } from "../api/imageErrors";
import { groupImagesByOriginal, paginateImageGroups, type ImageGroup } from "../utils/imageHistory";

interface ArchiveResult {
  revision: number;
  groups: ImageGroup[] | null;
  recordCount: number;
  error: string | null;
}

export function useGroupedImageHistory() {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<ArchiveResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getImageArchive(controller.signal).then((records) => {
      if (controller.signal.aborted) return;
      const groups = groupImagesByOriginal(records);
      setPage((current) => paginateImageGroups(groups, current).page);
      setResult({ revision, groups, recordCount: records.length, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        // Never publish partially collected groups. Keep the last complete archive.
        setResult((previous) => ({ revision, groups: previous?.groups ?? null,
          recordCount: previous?.recordCount ?? 0, error: getImageErrorMessage(error, "load") }));
      }
    });
    return () => controller.abort();
  }, [revision]);

  return {
    data: result?.groups ? { ...paginateImageGroups(result.groups, page), recordCount: result.recordCount } : null,
    loading: result?.revision !== revision,
    error: result?.revision === revision ? result.error : null,
    setPage,
    refresh: () => setRevision((current) => current + 1),
  };
}
