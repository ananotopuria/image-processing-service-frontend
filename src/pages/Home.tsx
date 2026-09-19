import type { ReactNode } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import specimen from "../assets/logo1.png";

function Moth({ className = "w-full" }: { className?: string }) {
  return (
    <div className={`relative aspect-350/230 overflow-hidden ${className}`}>
      <img
        src={specimen}
        alt="Engraved moth specimen with its wings spread"
        width={2046}
        height={769}
        className="absolute top-[-115.22%] left-[-133.14%] w-[584.57%] max-w-none"
      />
    </div>
  );
}

function ProcessingLink({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link
      to="/studio"
      className={`group inline-flex min-h-12 shrink-0 items-center justify-center gap-6 rounded-sm border border-ink px-5 py-3 text-sm ${
        inverted
          ? "bg-paper text-ink hover:bg-paper/90"
          : "bg-ink text-paper hover:bg-ink-hover"
      }`}
    >
      Begin Processing
      <ArrowRight
        size={18}
        aria-hidden="true"
        className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
      />
    </Link>
  );
}

function SectionHeading({
  id,
  label,
  children,
  description,
}: {
  id: string;
  label: string;
  children: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col items-start justify-between gap-5 sm:mb-10 sm:flex-row sm:items-end sm:gap-8">
      <div>
        <p className="mb-4 font-mono text-[11px] leading-relaxed">{label}</p>
        <h2
          id={id}
          className="font-editorial text-[34px] leading-[1.15] sm:text-[44px]"
        >
          {children}
        </h2>
      </div>
      {description && (
        <p className="max-w-90 text-sm leading-[1.8] text-muted-ink">
          {description}
        </p>
      )}
    </div>
  );
}

const steps = [
  [
    "Introduce the specimen",
    "Upload your original image in JPEG, PNG or WEBP.",
  ],
  [
    "Define its new form",
    "Set the dimensions, choose a format and adjust the quality.",
  ],
  [
    "Preserve the result",
    "Process and download your image. Find previous transformations in your history.",
  ],
];

const capabilities = [
  [
    "Resize",
    "A different scale. The same subject.",
    "Control width and height to give your image the dimensions it needs.",
    "WIDTH / HEIGHT",
  ],
  [
    "Optimize",
    "Less weight. More possibility.",
    "Adjust output quality to balance file size and image detail.",
    "QUALITY / FILE SIZE",
  ],
  [
    "Convert",
    "One original. Many forms.",
    "Convert between JPEG, PNG and WEBP for your next destination.",
    "JPEG / PNG / WEBP",
  ],
  [
    "Archive",
    "Keep a record of each change.",
    "Return to processed images and their metadata in your image history.",
    "PROCESSED / PRESERVED",
  ],
];

function Home() {
  return (
    <div>
      <section className="mx-auto max-w-7xl px-6" aria-labelledby="home-title">
        <div className="flex justify-between gap-4 pt-6 pb-5 font-mono text-[11px] leading-relaxed text-muted-ink sm:pt-5">
          <span>EST. 2026 / IMAGE PROCESSING SERVICE</span>
          <span className="hidden sm:inline">THE ART OF TRANSFORMATION</span>
        </div>
        <div className="grid items-center gap-3 pt-3 pb-6 sm:grid-cols-[1.1fr_1fr] sm:gap-6 sm:pt-10 sm:pb-13 lg:gap-12">
          <div>
            <p className="font-mono text-[11px] leading-relaxed">
              A NEW FORM FOR EVERY IMAGE
            </p>
            <h1
              id="home-title"
              className="my-5.5 font-editorial text-[42px] leading-[1.04] sm:text-[60px] lg:text-[82px]"
            >
              Metamorphose
              <br />
              your images.
            </h1>
            <p className="max-w-95 text-[15px] leading-[1.8] text-muted-ink sm:text-base">
              Upload, resize, optimize and convert. Give your images a new form,
              with control over what changes.
            </p>
            <div className="mt-5.5 flex flex-wrap items-center gap-x-5 gap-y-3 sm:mt-7.5 sm:gap-6">
              <ProcessingLink />
              <a
                href="#process"
                className="inline-flex min-h-11 items-center gap-2.5 text-[13px] hover:underline"
              >
                Explore the process <ArrowDown size={15} aria-hidden="true" />
              </a>
            </div>
          </div>
          <figure className="mx-auto w-full max-w-80 pt-4 sm:max-w-none sm:pt-6">
            <p className="text-right font-mono text-[11px] leading-relaxed text-muted-ink">
              FIG. 001 / METAMORPHOSIS
            </p>
            <Moth className="mx-auto my-3 w-[70%] sm:my-6 sm:w-full" />
            <figcaption className="flex flex-col gap-1 text-center sm:gap-3">
              <span className="font-editorial text-[22px] italic">
                A study in transformation.
              </span>
              <span className="font-mono text-[11px] leading-relaxed">
                ORIGINAL → TRANSFORM → PRESERVE
              </span>
            </figcaption>
          </figure>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-archive-line py-5 font-mono text-[11px] leading-relaxed sm:gap-4">
          <span>ONE IMAGE. MANY POSSIBILITIES.</span>
          <span>JPEG / PNG / WEBP</span>
        </div>
      </section>

      <section
        className="border-y border-archive-line bg-specimen-paper py-12 sm:py-20"
        aria-labelledby="transformation-title"
      >
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            id="transformation-title"
            label="01 / THE TRANSFORMATION"
            description={
              <>
                Different dimensions. A lighter file.
                <br />
                An image ready for where it goes next.
              </>
            }
          >
            Same specimen.
            <br />
            <em>A new expression.</em>
          </SectionHeading>
          <div className="grid gap-4.5 sm:grid-cols-2 sm:gap-12">
            {[false, true].map((processed) => (
              <figure
                key={String(processed)}
                className="border border-specimen-line bg-paper p-5"
              >
                <div className="flex justify-between gap-3 border-b border-archive-line pb-3 font-mono text-[11px] leading-relaxed">
                  <span>{processed ? "PROCESSED" : "ORIGINAL"} SPECIMEN</span>
                  <span>FIG. {processed ? "001-B" : "001"}</span>
                </div>
                <div className="relative grid min-h-45 place-items-center px-8.75 py-5 sm:min-h-50 sm:px-5 lg:min-h-61.25 lg:px-16.25">
                  <Moth className={processed ? "w-[77%]" : "w-full"} />
                  {processed && (
                    <span className="absolute right-0 bottom-3 font-mono text-[11px] leading-relaxed text-muted-ink">
                      QUALITY / 82
                    </span>
                  )}
                </div>
                <figcaption>
                  <dl className="grid grid-cols-[1.5fr_1fr_1fr] gap-3 border-t border-archive-line pt-4 font-mono">
                    {[
                      ["DIMENSIONS", processed ? "1200 × 1600" : "3024 × 4032"],
                      ["FORMAT", processed ? "WEBP" : "JPEG"],
                      ["FILE SIZE", processed ? "684 KB" : "4.82 MB"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="mb-1 text-[10px] text-muted-ink">
                          {label}
                        </dt>
                        <dd className="text-[13px]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-4.5 text-xs leading-relaxed text-muted-ink">
            Illustrative example. Output size and appearance depend on your
            image and processing settings.
          </p>
        </div>
      </section>

      <section
        id="process"
        className="mx-auto max-w-7xl scroll-mt-6 px-6 py-12 sm:py-20"
        aria-labelledby="process-title"
      >
        <SectionHeading
          id="process-title"
          label="02 / THE METHOD"
          description={
            <>
              From the first upload to the final download.
              <br />A considered process, without the complexity.
            </>
          }
        >
          Three steps.
          <br />
          <em>Quite a transformation.</em>
        </SectionHeading>
        <ol className="border-t border-archive-line">
          {steps.map(([title, description], index) => (
            <li
              key={title}
              className="grid grid-cols-[32px_1fr] items-center gap-4 border-b border-archive-line py-6 sm:grid-cols-[40px_1fr_1fr] sm:py-7.5 lg:grid-cols-[60px_1fr_1fr] lg:gap-6"
            >
              <span className="font-editorial text-[28px] text-muted-ink">
                0{index + 1}
              </span>
              <h3 className="font-editorial text-2xl sm:text-[25px]">
                {title}
              </h3>
              <p className="col-start-2 text-sm leading-[1.8] text-muted-ink sm:col-start-auto">
                {description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="border-y border-archive-line py-12 sm:py-20"
        aria-labelledby="capabilities-title"
      >
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading id="capabilities-title" label="03 / THE INSTRUMENTS">
            Purpose in every adjustment.
          </SectionHeading>
          <div className="grid gap-y-6 sm:grid-cols-2 sm:gap-y-9 lg:grid-cols-4">
            {capabilities.map(
              ([title, subtitle, description, metadata], index) => (
                <article
                  key={title}
                  className="border-t border-archive-line pt-6 sm:border-t-0 sm:border-l sm:px-6 sm:pt-0 sm:odd:border-l-0 sm:odd:pl-0 lg:odd:border-l lg:odd:pl-6 lg:first:border-l-0 lg:first:pl-0"
                >
                  <p className="font-mono text-[11px] leading-relaxed">
                    SPECIMEN / 0{index + 1}
                  </p>
                  <h3 className="my-3 font-editorial text-[35px] sm:mt-6">
                    {title}
                  </h3>
                  <p className="mb-3 text-sm leading-[1.8]">{subtitle}</p>
                  <p className="text-sm leading-[1.8] text-muted-ink">
                    {description}
                  </p>
                  <span className="mt-4.5 block font-mono text-[10px] leading-relaxed sm:mt-7">
                    {metadata}
                  </span>
                </article>
              ),
            )}
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-7xl px-6 py-12 text-center sm:py-17.5"
        aria-labelledby="brand-title"
      >
        <p className="font-mono text-[11px] leading-relaxed">
          A STUDY IN POSSIBILITY
        </p>
        <Moth className="mx-auto mt-6.5 mb-4 w-31.25" />
        <h2
          id="brand-title"
          className="mb-6.5 font-editorial text-[44px] leading-[1.15] sm:text-[62px]"
        >
          Every image has
          <br />
          <em>another form.</em>
        </h2>
        <p className="font-mono text-[11px] leading-relaxed">
          ORIGINAL → TRANSFORM → PRESERVE
        </p>
      </section>

      <section className="bg-ink text-paper" aria-labelledby="final-title">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-6 py-12 sm:flex-row sm:items-center">
          <div>
            <p className="font-mono text-[11px] leading-relaxed">
              READY FOR METAMORPHOSIS?
            </p>
            <h2
              id="final-title"
              className="mt-3 font-editorial text-[32px] leading-[1.15] sm:text-[34px]"
            >
              Transform your first image.
            </h2>
          </div>
          <ProcessingLink inverted />
        </div>
      </section>
    </div>
  );
}

export default Home;
