import { transformImage, uploadImage } from "./images";
import type { ImageMetadata, TransformImageRequest } from "./images.types";
import { requireOriginal } from "../utils/reprocessing";

type StudioSource =
  | { kind: "saved"; original: ImageMetadata }
  | { kind: "file"; file: File; original: ImageMetadata | null };

// The saved branch has no File, upload, or storage download dependency.
export async function processStudioSource(source: StudioSource, body: TransformImageRequest, signal: AbortSignal, callbacks: {
  onOriginal: (original: ImageMetadata) => void;
  onPhase: (phase: "uploading" | "processing") => void;
}): Promise<ImageMetadata> {
  signal.throwIfAborted();
  let original = source.original;
  if (source.kind === "saved") requireOriginal(source.original);
  if (source.kind === "file" && !original) {
    callbacks.onPhase("uploading");
    original = await uploadImage(source.file, signal);
    signal.throwIfAborted();
    callbacks.onOriginal(original);
  }
  const verified = requireOriginal(original!);
  callbacks.onPhase("processing");
  return transformImage(verified._id, body, signal);
}
