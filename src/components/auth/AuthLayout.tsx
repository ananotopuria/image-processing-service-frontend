import type { ReactNode } from "react";
import specimen from "../../assets/logo1.png";

type AuthLayoutProps = {
  mode: "login" | "register";
  children: ReactNode;
};

function AuthLayout({ mode, children }: AuthLayoutProps) {
  const isRegister = mode === "register";

  return (
    <section className="mx-auto max-w-7xl px-6" aria-labelledby="auth-title">
      <div className="flex flex-wrap justify-between gap-2 border-b border-archive-line py-5 font-mono text-[11px] leading-relaxed text-muted-ink">
        <span>MOTHFRAME / PRIVATE ARCHIVE</span>
        <span className="hidden sm:inline">
          {isRegister ? "02 / REGISTRATION" : "01 / ARCHIVE ACCESS"}
        </span>
      </div>

      <div className="grid lg:grid-cols-2">
        <aside className="hidden flex-col justify-between border-r border-archive-line py-14 pr-14 lg:flex xl:pr-20">
          <div>
            <p className="font-mono text-[11px] leading-relaxed text-muted-ink">
              THE ART OF TRANSFORMATION
            </p>
            <h2 className="mt-5 font-editorial text-[52px] leading-[1.08]">
              {isRegister ? "A place for" : "Every image has"}
              <br />
              <em>{isRegister ? "new possibilities." : "another form."}</em>
            </h2>
          </div>

          <figure className="my-9">
            <div className="flex items-center gap-4 font-mono text-[10px] text-muted-ink">
              <span>FIG. {isRegister ? "002" : "001"}</span>
              <span className="h-px flex-1 bg-archive-line" />
              <span>LEPIDOPTERA</span>
            </div>
            <div className="relative mx-auto my-6 aspect-350/230 w-full max-w-85 overflow-hidden">
              <img
                src={specimen}
                alt="Engraved moth specimen with its wings spread"
                width={2046}
                height={769}
                className="absolute top-[-115.22%] left-[-133.14%] w-[584.57%] max-w-none"
              />
            </div>
            <figcaption className="text-center font-editorial text-xl italic">
              {isRegister
                ? "The beginning of a new collection."
                : "A study in transformation."}
            </figcaption>
          </figure>

          <div className="flex flex-wrap justify-between gap-3 border-t border-archive-line pt-5 font-mono text-[10px] leading-relaxed text-muted-ink">
            <span>ORIGINAL → TRANSFORM → PRESERVE</span>
            <span>EST. 2026</span>
          </div>
        </aside>

        <div className="min-w-0 py-10 sm:py-14 lg:pl-14 xl:pl-20">
          <div className="mx-auto max-w-110 lg:mx-0">
            <p className="font-mono text-[11px] leading-relaxed text-muted-ink">
              {isRegister ? "NEW ACCOUNT / REGISTRATION" : "ARCHIVE ACCESS / 2026"}
            </p>
            <h1
              id="auth-title"
              className="mt-5 font-editorial text-[40px] leading-[1.1] sm:text-[50px]"
            >
              {isRegister ? "Join the archive." : "Return to the archive."}
            </h1>
            <p className="mt-4 max-w-90 text-[15px] leading-[1.8] text-muted-ink">
              {isRegister
                ? "A space to transform your images and keep a record of each change."
                : "Continue processing, transforming and preserving your images."}
            </p>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AuthLayout;
