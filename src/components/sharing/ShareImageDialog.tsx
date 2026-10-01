import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import type { ImageMetadata } from "../../api/images.types";
import { createShareSubmission } from "../../sharing/submission";
import { imageFilename } from "../../utils/imageFilename";
import { activateModal } from "../../utils/modal";
import { sharingState } from "../../sharing/state";
import { useAuth } from "../../auth/useAuth";

export default function ShareImageDialog({ image, returnFocus, onClose }: { image: ImageMetadata; returnFocus: HTMLElement; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const input = useRef<HTMLInputElement>(null);
  const [submission] = useState(createShareSubmission);
  const { pending, error: requestError } = useSyncExternalStore(submission.subscribe, submission.getSnapshot, submission.getSnapshot);
  const [email, setEmail] = useState("");
  const [validationError, setError] = useState("");
  const error = validationError || requestError;
  const close = () => { submission.cancel(); onClose(); };
  const { user } = useAuth();
  useEffect(() => {
    const cleanup = dialog.current && input.current ? activateModal(dialog.current, input.current, returnFocus) : undefined;
    return () => { submission.cancel(); cleanup?.(); };
  }, [returnFocus, submission]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending) return;
    const recipient = email.trim().toLowerCase();
    if (!recipient || !input.current?.validity.valid) { setError("Enter a valid recipient email address."); input.current?.focus(); return; }
    if (recipient === user?.email?.toLowerCase()) { setError("You cannot share an image with yourself."); return; }
    setError("");
    await submission.submit(image._id, recipient, (confirmedEmail) => {
      close();
      sharingState.shared(confirmedEmail);
    });
  }
  return <dialog ref={dialog} aria-labelledby="share-title" aria-describedby="share-description" onCancel={(event) => { event.preventDefault(); close(); }}
    className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-sm border border-archive-line bg-paper p-5 text-ink shadow-xl backdrop:bg-ink/60 sm:p-6">
    <div className="flex items-center justify-between gap-3"><p className="font-mono text-[11px] text-muted-ink">MOTHFRAME / SHARE A SPECIMEN</p><button type="button" onClick={close} aria-label="Close share dialog" className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center"><X size={18} /></button></div>
    <h2 id="share-title" className="mt-3 font-editorial text-3xl">Share this image.</h2>
    <p className="mt-3 wrap-anywhere font-semibold">{imageFilename(image)}</p>
    <p id="share-description" className="mt-3 text-sm leading-relaxed text-muted-ink">Share this exact image with a registered account. They can preview and download it; no other images or versions are included.</p>
    <form onSubmit={(event) => { void submit(event); }} noValidate className="mt-4" aria-busy={pending}>
      <label htmlFor="share-email" className="text-sm">Recipient email</label>
      <input ref={input} id="share-email" type="email" autoComplete="email" required value={email} disabled={pending}
        onChange={(event) => { setEmail(event.target.value); setError(""); submission.clearError(); }} aria-invalid={Boolean(error)} aria-describedby={error ? "share-error" : undefined}
        className="mt-2 min-h-12 w-full rounded-sm border border-specimen-line bg-paper px-3 text-sm" placeholder="recipient@example.com" />
      {error && <p id="share-error" role="alert" className="mt-4 text-sm leading-relaxed">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-4"><button type="submit" disabled={pending} className="min-h-12 cursor-pointer rounded-sm bg-ink px-5 text-sm text-paper disabled:opacity-50">{pending ? "Sharing…" : "Share image"}</button>
        <Link to="/images?view=sent" onClick={close} className="inline-flex min-h-12 items-center text-sm underline">View sent shares</Link></div>
    </form>
  </dialog>;
}
