import { useEffect, useRef } from "react";
import type { ImageMetadata } from "../../api/images.types";
import { imageDeleteMessage } from "../../utils/imageHistory";

export default function DeleteImageDialog({ image, pending, error, onCancel, onConfirm, onRefresh }: {
  image: ImageMetadata; pending: boolean; error: string | null;
  onCancel: () => void; onConfirm: () => void; onRefresh: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="delete-image-title" aria-describedby="delete-image-description" onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-3rem)] max-w-lg overflow-y-auto rounded-sm border border-archive-line bg-paper p-6 text-ink shadow-xl backdrop:bg-ink/60 sm:p-8">
      <p className="font-mono text-[11px] text-muted-ink">MOTHFRAME / REMOVE FROM ARCHIVE</p>
      <h2 id="delete-image-title" className="mt-4 font-editorial text-3xl">{image.kind === "original" ? "Delete original and all versions?" : "Delete this image?"}</h2>
      <p className="mt-4 wrap-anywhere text-sm font-semibold">{image.originalName}</p>
      <p id="delete-image-description" className="mt-3 text-sm leading-relaxed text-muted-ink">{imageDeleteMessage(image)}</p>
      <div role="alert">{error && <p className="mt-5 border-l-2 border-ink bg-specimen-paper p-3 text-sm leading-relaxed">{error}</p>}</div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button ref={cancel} type="button" disabled={pending} onClick={onCancel} className="min-h-12 cursor-pointer rounded-sm border border-ink px-5 text-sm disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
        <button type="button" disabled={pending} onClick={onConfirm} className="min-h-12 cursor-pointer rounded-sm bg-ink px-5 text-sm text-paper hover:bg-ink-hover disabled:cursor-wait disabled:opacity-50">{pending ? "Deleting…" : image.kind === "original" ? "Delete original and versions" : "Delete image"}</button>
        {error && <button type="button" disabled={pending} onClick={onRefresh} className="min-h-12 cursor-pointer px-2 text-sm underline">Refresh gallery</button>}
      </div>
      <p role="status" className="mt-3 text-sm text-muted-ink">{pending ? "Deleting the selected image. Please wait…" : ""}</p>
    </dialog>
  );
}
