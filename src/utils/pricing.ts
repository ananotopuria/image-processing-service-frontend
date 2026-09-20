import type { Location } from "react-router-dom";

export const PRICING_COUNTDOWN_SECONDS = 5;

const returnPaths = new Set([
  "/", "/dashboard", "/upload", "/images", "/studio", "/history", "/login", "/register",
]);

// Only known app pages are return destinations. Never trust arbitrary router state.
export function safePricingReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || /^\/\//.test(value) || /[\\\s]/.test(value)) {
    return "/";
  }

  try {
    const url = new URL(value, "https://mothframe.invalid");
    const pathname = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (url.origin !== "https://mothframe.invalid" || !returnPaths.has(pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function pricingReturnFromState(state: unknown): string {
  return safePricingReturnTo(
    state && typeof state === "object" && "returnTo" in state ? state.returnTo : undefined,
  );
}

export function pricingLinkState(location: Pick<Location, "pathname" | "search" | "hash" | "state">) {
  // Clicking Pricing again keeps the original destination instead of creating a loop.
  const isPricing = location.pathname.toLowerCase().replace(/\/+$/, "") === "/pricing";
  return {
    returnTo: isPricing
      ? pricingReturnFromState(location.state)
      : safePricingReturnTo(`${location.pathname}${location.search}${location.hash}`),
  };
}

// The same cancellation function handles both Stay here and effect cleanup.
export function startPricingCountdown(onTick: (seconds: number) => void, onComplete: () => void) {
  let remaining = PRICING_COUNTDOWN_SECONDS;
  let active = true;
  const timer = setInterval(() => {
    if (!active) return;
    remaining -= 1;
    if (remaining > 0) {
      onTick(remaining);
    } else {
      cancel();
      onComplete();
    }
  }, 1000);

  function cancel() {
    active = false;
    clearInterval(timer);
  }

  return cancel;
}
