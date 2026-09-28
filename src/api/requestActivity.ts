export const API_TIMEOUT_MS = 120_000;
export const SLOW_REQUEST_DELAY_MS = 8_000;

// Track only activity, never URLs, credentials, tokens, or uploaded data.
export function createRequestActivity() {
  const listeners = new Set<() => void>();
  let slowRequests = 0;
  const emit = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => slowRequests > 0,
    begin(signal?: { aborted: boolean; addEventListener?: AbortSignal["addEventListener"]; removeEventListener?: AbortSignal["removeEventListener"] }) {
      let finished = false;
      let slow = false;
      const timer = setTimeout(() => {
        if (finished) return;
        slow = true;
        slowRequests++;
        emit();
      }, SLOW_REQUEST_DELAY_MS);

      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", finish);
        if (slow) {
          slowRequests--;
          emit();
        }
      }

      signal?.addEventListener?.("abort", finish, { once: true });
      if (signal?.aborted) finish();
      return finish;
    },
  };
}

export const requestActivity = createRequestActivity();
