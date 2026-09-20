import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { PRICING_COUNTDOWN_SECONDS, pricingReturnFromState, startPricingCountdown } from "../utils/pricing";

const features = [
  "Image uploads",
  "Resize and crop",
  "Rotate, flip, and mirror",
  "Grayscale and sepia filters",
  "JPEG, PNG, and WebP output",
  "Image history",
  "Original image preservation",
  "Multiple transformed versions",
];

function Pricing() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = pricingReturnFromState(location.state);
  const [seconds, setSeconds] = useState(PRICING_COUNTDOWN_SECONDS);
  const [staying, setStaying] = useState(false);
  const cancelCountdown = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (staying) return;
    const cancel = startPricingCountdown(setSeconds, () => {
      void navigate(returnTo, { replace: true });
    });
    cancelCountdown.current = cancel;
    return cancel;
  }, [navigate, returnTo, staying]);

  function stayHere() {
    cancelCountdown.current?.();
    setStaying(true);
  }

  return (
    <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14" aria-labelledby="pricing-title">
      <header className="text-center">
        <p className="font-mono text-[11px] tracking-widest text-muted-ink">PRICING</p>
        <h1 id="pricing-title" className="mt-3 font-editorial text-3xl sm:text-4xl">Simple pricing.</h1>
      </header>

      <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-sm border border-specimen-line bg-specimen-paper px-4 py-4 sm:flex-row sm:px-6">
        <p className="sr-only">This page automatically returns to your previous page after five seconds. Choose Stay here to cancel.</p>
        <p aria-live="off" className="flex min-h-14 items-center gap-2 text-base font-medium sm:gap-3 sm:text-lg">
          {staying ? "Fine. You can stay." : <>Taking you back in <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-sm bg-ink font-mono text-4xl text-paper tabular-nums">{seconds}</span>...</>}
        </p>
        <button
          type="button"
          onClick={stayHere}
          disabled={staying}
          className="inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-ink bg-paper px-6 py-3 text-base font-medium hover:bg-ink hover:text-paper disabled:cursor-default disabled:border-specimen-line disabled:bg-paper disabled:text-muted-ink"
        >
          {staying ? "Staying here" : "Stay here"}
        </button>
        <span role="status" className="sr-only">{staying ? "Automatic return cancelled. Fine. You can stay." : ""}</span>
      </div>

      <div className="mt-8 grid items-center gap-8 md:mt-10 md:grid-cols-2 md:gap-12">
        <div className="text-center md:text-left">
          <h2 className="font-editorial leading-[1.05]">
            <span className="block text-[38px] sm:text-[48px]">Just kidding.</span>
            <span className="mt-2 block text-[72px] tracking-tight sm:text-[88px]">It's free.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-sm text-[15px] leading-[1.8] text-muted-ink md:mx-0">
            Upload, transform, convert, and manage your images without choosing a plan.
            This demo currently has no paid plans.
          </p>
          <Link
            to={isAuthenticated ? "/upload" : "/login"}
            className="group mt-7 inline-flex min-h-12 items-center justify-center gap-6 rounded-sm border border-ink bg-ink px-5 py-3 text-sm text-paper hover:bg-ink-hover"
          >
            Start processing
            <ArrowRight size={18} aria-hidden="true" className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-1" />
          </Link>

        </div>

        <section className="rounded-sm border border-specimen-line bg-specimen-paper p-6 sm:p-8" aria-labelledby="free-plan-title">
          <h2 id="free-plan-title" className="font-mono text-[11px] tracking-widest">FREE</h2>
          <p className="mt-3 font-editorial text-[64px] leading-none">$0</p>
          <p className="mt-4 text-sm leading-6 text-muted-ink">No credit card. No mysterious "Pro" tier.</p>
          <ul className="mt-6 space-y-3 border-t border-specimen-line pt-6">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm leading-6">
                <Check size={16} className="mt-1 shrink-0" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

export default Pricing;
