import { useEffect, useRef } from "react";
import { Sprout, X } from "lucide-react";
import { Link } from "react-router-dom";
import { activateModal } from "../../utils/modal";

export default function DemoPlanDialog({ onClose, returnFocus }: { onClose: () => void; returnFocus?: HTMLElement }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (dialog.current && close.current) return activateModal(dialog.current, close.current, returnFocus);
  }, [returnFocus]);

  return <dialog ref={dialog} aria-labelledby="pricing-dialog-title" aria-describedby="pricing-dialog-description"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-3rem)] max-w-lg overflow-y-auto overscroll-contain rounded-sm border border-archive-line bg-paper p-6 text-ink shadow-xl backdrop:bg-ink/60 sm:p-9">
    <div className="flex items-center justify-between gap-4 border-b border-archive-line pb-4">
      <p className="font-mono text-[10px] tracking-wider text-muted-ink">MOTHFRAME / A SMALL CONFESSION</p>
      <button ref={close} type="button" onClick={onClose} aria-label="Close dialog" className="-mr-2 inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-specimen-paper focus-visible:outline-2 focus-visible:outline-offset-2"><X size={19} strokeWidth={1.5} aria-hidden="true" /></button>
    </div>
    <Sprout size={34} strokeWidth={1} aria-hidden="true" className="mt-7 text-muted-ink" />
    <h2 id="pricing-dialog-title" className="mt-5 font-editorial text-4xl leading-tight">Your money is safe.</h2>
    <p id="pricing-dialog-description" className="mt-5 text-[15px] leading-relaxed text-muted-ink">Just kidding — this is a portfolio project. All features are free. Go make something beautiful.</p>
    <Link to="/images" className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-sm border border-ink bg-ink px-5 py-3 text-sm text-paper hover:bg-ink-hover focus-visible:outline-2 focus-visible:outline-offset-4">Take me to History →</Link>
  </dialog>;
}
