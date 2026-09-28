import { useSyncExternalStore } from "react";
import { requestActivity } from "../api/requestActivity";

export default function ServiceStatus() {
  const slow = useSyncExternalStore(requestActivity.subscribe, requestActivity.getSnapshot, () => false);
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {slow && (
        <p className="mt-4 border-l-2 border-ink bg-specimen-paper px-4 py-3 text-sm leading-relaxed text-muted-ink">
          The image service may be starting up. The first request can take about
          a minute on the free demo. Your request is still running.
        </p>
      )}
    </div>
  );
}
