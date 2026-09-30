import { useState } from "react";
import { ArrowRight, Check, Flower2, Leaf, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import DemoPlanDialog from "../components/pricing/DemoPlanDialog";

const plans = [
  { name: "Starter", price: "0", quota: "10 image uploads", action: "Start creating", icon: Sprout, note: "A small seed of possibility." },
  { name: "Creator", price: "9", quota: "100 image uploads", action: "Get Creator", icon: Leaf, note: "A little room to grow." },
  { name: "Studio", price: "19", quota: "Unlimited image uploads", action: "Get Studio", icon: Flower2, note: "Let your imagination bloom." },
];
const features = ["All image transformations", "Original image storage", "Download processed images"];

export default function Pricing() {
  const [dialogTrigger, setDialogTrigger] = useState<HTMLButtonElement | null>(null);
  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-16" aria-labelledby="pricing-title">
      <div className="flex flex-wrap justify-between gap-3 border-b border-archive-line pb-5 font-mono text-[11px] text-muted-ink">
        <span>MOTHFRAME / A STUDY IN POSSIBILITY</span><span>FIELD NOTES, NO. 03</span>
      </div>
      <header className="mx-auto max-w-3xl pt-10 text-center sm:pt-14">
        <div aria-hidden="true" className="mb-5 flex items-center justify-center gap-4 text-muted-ink"><span className="h-px w-10 bg-specimen-line" /><Sprout size={25} strokeWidth={1} /><span className="h-px w-10 bg-specimen-line" /></div>
        <h1 id="pricing-title" className="text-balance font-editorial text-[40px] leading-[1.12] sm:text-[56px]">A little plan for every imagination.</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted-ink sm:text-base">Choose your creative ambitions. We’ll take care of the pixels.</p>
      </header>

      <div className="mt-12 grid gap-7 md:grid-cols-3 md:gap-5 lg:gap-7">
        {plans.map(({ name, price, quota, action, icon: Icon, note }, index) => {
          const popular = name === "Creator";
          const buttonClass = `group mt-8 inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-sm border border-ink px-5 py-3 text-sm motion-safe:transition-colors ${popular ? "bg-ink text-paper hover:bg-ink-hover" : "bg-paper hover:bg-specimen-paper"}`;
          return <article key={name} aria-labelledby={`plan-${name.toLowerCase()}`} className={`relative flex min-w-0 flex-col rounded-sm border p-6 motion-safe:transition-[transform,box-shadow] motion-safe:duration-200 motion-safe:hover:-translate-y-1 hover:shadow-md lg:p-8 ${popular ? "border-ink bg-specimen-paper" : "border-archive-line bg-paper"}`}>
            {popular && <p className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-ink bg-ink px-4 py-1 font-mono text-[10px] tracking-wider text-paper">Most popular</p>}
            <div aria-hidden="true" className="flex items-center justify-between text-muted-ink"><span className="font-mono text-[10px] tracking-widest">SPECIMEN 0{index + 1}</span><Icon size={29} strokeWidth={1} /></div>
            <h2 id={`plan-${name.toLowerCase()}`} className="mt-7 font-editorial text-3xl">{name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-ink">{note}</p>
            <p className="mt-7 flex flex-wrap items-baseline gap-2"><span className="font-editorial text-[60px] leading-none tracking-tight">${price}</span>{index > 0 && <span className="text-sm text-muted-ink">/ month</span>}</p>
            <ul className="mt-7 flex-1 space-y-4 border-t border-specimen-line pt-6">
              {[quota, ...features].map((feature) => <li key={feature} className="flex items-start gap-3 text-sm leading-relaxed"><Check size={16} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{feature}</span></li>)}
            </ul>
            {index === 0 ? <Link to="/images" className={buttonClass}>{action}<ArrowRight size={16} aria-hidden="true" /></Link>
              : <button type="button" aria-haspopup="dialog" onClick={(event) => setDialogTrigger(event.currentTarget)} className={`${buttonClass} cursor-pointer`}>{action}<ArrowRight size={16} aria-hidden="true" /></button>}
          </article>;
        })}
      </div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-muted-ink">Demo plans — no payment required. All features are free; the upload quotas above are illustrative.</p>
      {dialogTrigger && <DemoPlanDialog returnFocus={dialogTrigger} onClose={() => setDialogTrigger(null)} />}
    </section>
  );
}
