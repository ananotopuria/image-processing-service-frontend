import { createShare, sharingError } from "../api/sharing";

// Each mounted dialog owns a submission. Closing it cancels its callbacks even
// if the server finishes creating the share after the dialog has disappeared.
export function createShareSubmission() {
  let state = { pending: false, error: "" };
  let request: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => { state = next; listeners.forEach((listener) => listener()); };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    clearError: () => publish({ ...state, error: "" }),
    cancel() {
      request?.abort(); request = null;
      publish({ pending: false, error: "" });
    },
    async submit(imageId: string, email: string, onSuccess: (email: string) => void) {
      if (request) return;
      const controller = new AbortController(); request = controller;
      const recipient = email.trim().toLowerCase();
      publish({ pending: true, error: "" });
      try {
        await createShare(imageId, recipient, controller.signal);
        if (!controller.signal.aborted && request === controller) onSuccess(recipient);
      } catch (error) {
        if (!controller.signal.aborted && request === controller) publish({ pending: false, error: sharingError(error) });
      } finally {
        if (request === controller) { request = null; publish({ ...state, pending: false }); }
      }
    },
  };
}
