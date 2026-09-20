import { Link } from "react-router-dom";

function Studio() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-16" aria-labelledby="upload-title">
      <p className="font-mono text-[11px] text-muted-ink">MOTHFRAME / UPLOAD WORKSPACE</p>
      <h1 id="upload-title" className="mt-5 font-editorial text-[40px] leading-[1.1] sm:text-[56px]">Upload Image</h1>
      <div className="mt-8 border border-dashed border-specimen-line bg-specimen-paper p-6 sm:p-10">
        <p className="font-mono text-[11px] text-muted-ink">COMING SOON</p>
        <p className="mt-3 max-w-lg text-sm leading-[1.8] text-muted-ink">
          This space is reserved for image uploads. Uploading and processing images are not available yet.
        </p>
      </div>
      <Link to="/dashboard" className="mt-6 inline-flex min-h-11 items-center text-sm underline">Back to dashboard</Link>
    </section>
  );
}

export default Studio;
