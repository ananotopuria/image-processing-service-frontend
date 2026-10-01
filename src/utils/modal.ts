// Native modal dialogs make the surrounding page inert. Explicit Tab wrapping
// keeps keyboard focus on the dialog controls, including at either boundary.
export function activateModal(dialog: HTMLDialogElement, initialFocus: HTMLElement, returnFocus?: HTMLElement) {
  // Some browsers do not focus buttons on pointer clicks; prefer the opener.
  const previousFocus = returnFocus ?? document.activeElement;
  const previousBodyOverflow = document.body.style.overflow;
  const previousRootOverflow = document.documentElement.style.overflow;
  dialog.showModal();
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";
  initialFocus.focus({ preventScroll: true });

  function trapFocus(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  dialog.addEventListener("keydown", trapFocus);
  return () => {
    dialog.removeEventListener("keydown", trapFocus);
    dialog.close();
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousRootOverflow;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  };
}
