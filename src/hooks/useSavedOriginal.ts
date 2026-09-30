import { useEffect, useState } from "react";
import { getSavedOriginal } from "../api/images";
import { getImageErrorMessage } from "../api/imageErrors";
import type { ImageMetadata } from "../api/images.types";
import type { EditorImage } from "../components/images/ImagePreview";
import { loadSavedImagePreview } from "../utils/savedImagePreview";

interface SavedOriginal {
  revision: number;
  original: ImageMetadata | null;
  preview: EditorImage | null;
  previewLoading: boolean;
  error: string;
  previewError: string;
}

export function useSavedOriginal(originalId: string | null) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<SavedOriginal | null>(null);

  useEffect(() => {
    if (originalId === null) return;
    const controller = new AbortController();
    let previewUrl: string | undefined;
    async function load() {
      let original: ImageMetadata;
      try {
        original = await getSavedOriginal(originalId!, controller.signal);
        if (controller.signal.aborted) return;
        setState({ revision, original, preview: null, previewLoading: true, error: "", previewError: "" });
      } catch (error) {
        if (!controller.signal.aborted) setState({ revision, original: null, preview: null, previewLoading: false, error: getImageErrorMessage(error, "load"), previewError: "" });
        return;
      }
      // A failed storage preview must not prevent non-crop transformations.
      const previewController = new AbortController();
      const timeout = window.setTimeout(() => previewController.abort(), 30000);
      try {
        const preview = await loadSavedImagePreview(original, AbortSignal.any([controller.signal, previewController.signal]));
        if (controller.signal.aborted) { URL.revokeObjectURL(preview.url); return; }
        previewUrl = preview.url;
        setState({ revision, original, preview, previewLoading: false, error: "", previewError: "" });
      } catch {
        if (!controller.signal.aborted) setState({ revision, original, preview: null, previewLoading: false, error: "", previewError: "The original preview could not be opened. Retry to load the preview and enable cropping. Other transformations are still available." });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => { controller.abort(); if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [originalId, revision]);

  const current = state?.revision === revision ? state : null;
  return {
    original: current?.original ?? null,
    preview: current?.preview ?? null,
    loading: originalId !== null && !current,
    previewLoading: current?.previewLoading ?? false,
    error: current?.error ?? "",
    previewError: current?.previewError ?? "",
    refresh: () => setRevision((value) => value + 1),
  };
}
