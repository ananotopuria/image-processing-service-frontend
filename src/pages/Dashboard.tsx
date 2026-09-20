import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

function Dashboard() {
  const { user } = useAuth();
  const greeting = user?.username?.trim() || user?.email || "archivist";

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-16" aria-labelledby="dashboard-title">
      <p className="font-mono text-[11px] leading-relaxed text-muted-ink">
        MOTHFRAME / YOUR WORKSPACE
      </p>
      <h1 id="dashboard-title" className="mt-5 wrap-anywhere font-editorial text-[40px] leading-[1.1] sm:text-[56px]">
        Welcome, {greeting}.
      </h1>
      <p className="mt-4 max-w-lg text-[15px] leading-[1.8] text-muted-ink">
        A place for your images to take a new form. Your upload workspace and image archive begin here.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-5">
        <Link to="/upload" className="inline-flex min-h-12 items-center justify-center gap-6 rounded-sm border border-ink bg-ink px-5 py-3 text-sm text-paper hover:bg-ink-hover">
          Upload Image <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link to="/images" className="inline-flex min-h-12 items-center gap-3 text-sm underline decoration-ink/40 hover:decoration-ink">
          View image history <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <section className="mt-12 border-t border-archive-line pt-8 sm:mt-16" aria-labelledby="recent-images-title">
        <p className="font-mono text-[11px] text-muted-ink">YOUR ARCHIVE</p>
        <h2 id="recent-images-title" className="mt-3 font-editorial text-[30px] sm:text-[36px]">
          Recent images
        </h2>
        <div className="mt-6 border border-dashed border-specimen-line bg-specimen-paper px-6 py-10 sm:px-10">
          <p className="font-mono text-[11px] text-muted-ink">RESERVED FOR RECENT IMAGES</p>
          <p className="mt-3 max-w-lg text-sm leading-[1.8] text-muted-ink">
            This area will display recent images when the image archive is connected. Image data is not loaded yet.
          </p>
        </div>
      </section>
    </section>
  );
}

export default Dashboard;
