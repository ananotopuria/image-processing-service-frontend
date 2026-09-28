import { useId, useState } from "react";
import { ArrowLeftRight, ChevronDown } from "lucide-react";

interface SpecimenComparisonProps {
  originalSrc: string;
  processedSrc: string;
}

// Inspired by Aceternity's Compare interaction; uses native controls, no motion dependency.
export default function SpecimenComparison({ originalSrc, processedSrc }: SpecimenComparisonProps) {
  const [position, setPosition] = useState(50);
  const id = useId();

  return (
    <details className="group mt-6 border border-specimen-line bg-paper">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3 text-sm">
          <ArrowLeftRight size={16} aria-hidden="true" />
          Inspect the detail
        </span>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
      </summary>
      <div className="border-t border-archive-line p-4 sm:p-6">
        <figure className="mx-auto max-w-2xl">
          <div className="mb-3 flex flex-wrap justify-between gap-2 font-mono text-[10px] text-muted-ink">
            <span>ORIGINAL / 491.3 KB</span>
            <span>PROCESSED / 103.2 KB</span>
          </div>
          <div className="relative isolate aspect-3/2 overflow-hidden border border-archive-line bg-paper" aria-hidden="true">
            {/* Both files use the same crop and scale so the divider compares detail fairly. */}
            <img
              src={originalSrc}
              alt=""
              width={1536}
              height={1024}
              loading="lazy"
              draggable={false}
              className="pointer-events-none absolute -top-1/2 -left-1/2 h-[200%] w-[200%] max-w-none mix-blend-multiply"
            />
            <div className="absolute inset-0 overflow-hidden bg-paper" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
              <img
                src={processedSrc}
                alt=""
                width={768}
                height={512}
                loading="lazy"
                draggable={false}
                className="pointer-events-none absolute -top-1/2 -left-1/2 h-[200%] w-[200%] max-w-none mix-blend-multiply"
              />
            </div>
            <div className="pointer-events-none absolute inset-y-0 w-px bg-ink" style={{ left: `${position}%` }}>
              <span className="absolute top-1/2 left-0 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ink bg-paper">
                <ArrowLeftRight size={14} />
              </span>
            </div>
          </div>
          <figcaption className="mt-3 text-xs leading-relaxed text-muted-ink">
            The same fern detail at 2× magnification. Compare the original with its
            smaller, optimized JPEG at the same display scale.
          </figcaption>
          <label htmlFor={id} className="mt-5 block font-mono text-[11px]">REVEAL ORIGINAL DETAIL</label>
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            step={1}
            value={position}
            onChange={(event) => setPosition(Number(event.currentTarget.value))}
            aria-valuetext={`${position}% original, ${100 - position}% processed`}
            aria-describedby={`${id}-hint`}
            className="block min-h-11 w-full cursor-ew-resize accent-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          />
          <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-ink">
            Move the slider or use the arrow keys. Home shows the processed image;
            End shows the original.
          </p>
        </figure>
      </div>
    </details>
  );
}
