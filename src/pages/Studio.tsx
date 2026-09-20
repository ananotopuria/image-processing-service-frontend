import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { refreshImageLinks, transformImage, uploadImage } from "../api/images";
import { getImageErrorMessage } from "../api/imageErrors";
import type { ImageMetadata, TransformationSettings } from "../api/images.types";
import ImageDropzone from "../components/images/ImageDropzone";
import type { SelectedImage } from "../components/images/ImagePreview";
import TransformationControls from "../components/images/TransformationControls";
import ProcessingResult from "../components/images/ProcessingResult";
import { buildTransformRequest, createDefaultSettings, prepareImagePreview } from "../utils/images";

function Studio() {
  const [selected, setSelected] = useState<SelectedImage | null>(null);
  const [settings, setSettings] = useState<TransformationSettings>(createDefaultSettings);
  const [original, setOriginal] = useState<ImageMetadata | null>(null);
  const [result, setResult] = useState<ImageMetadata | null>(null);
  const [phase, setPhase] = useState<"idle" | "checking" | "uploading" | "processing" | "refreshing">("idle");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const selectionVersion = useRef(0);
  const busy = phase !== "idle";

  useEffect(() => () => {
    selectionVersion.current++;
    request.current?.abort();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  function clearSelection() {
    selectionVersion.current++;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setSelected(null);
    setOriginal(null);
    setResult(null);
    setError("");
  }

  async function selectImage(files: File[]) {
    if (request.current) return;
    if (files.length !== 1) { setError("Choose one image at a time."); return; }
    const version = ++selectionVersion.current;
    setPhase("checking");
    setError("");
    try {
      const image = await prepareImagePreview(files[0]);
      if (version !== selectionVersion.current) { URL.revokeObjectURL(image.url); return; }
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = image.url;
      setSelected(image);
      setOriginal(null);
      setResult(null);
    } catch (error: unknown) {
      if (version === selectionVersion.current) setError(getImageErrorMessage(error));
    } finally {
      if (version === selectionVersion.current) setPhase("idle");
    }
  }

  async function processImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (request.current || busy || !selected) return;
    // Reveal invalid controls even if their editor section is collapsed.
    if (!form.checkValidity()) {
      const invalid = form.querySelector<HTMLInputElement>("input:invalid");
      const section = invalid?.closest("details");
      if (section) section.open = true;
      invalid?.focus();
      invalid?.reportValidity();
      setError("Check the highlighted transformation setting before processing.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setError("");
    try {
      const body = buildTransformRequest(settings);
      let source = original;
      if (!source) {
        setPhase("uploading");
        source = await uploadImage(selected.file, controller.signal);
        if (controller.signal.aborted) return;
        setOriginal(source);
      }
      setPhase("processing");
      const processed = await transformImage(source._id, body, controller.signal);
      if (!controller.signal.aborted) setResult(processed);
    } catch (error: unknown) {
      if (!controller.signal.aborted) setError(getImageErrorMessage(error));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPhase("idle");
    }
  }

  async function refreshLinks() {
    if (!result || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setPhase("refreshing");
    try {
      const refreshed = await refreshImageLinks(result._id, controller.signal);
      if (!controller.signal.aborted) setResult(refreshed);
    } catch (error: unknown) {
      if (!controller.signal.aborted) setError(getImageErrorMessage(error));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPhase("idle");
    }
  }

  const status = { idle: "", checking: "Checking your image…", uploading: "Uploading original image…", processing: "Processing image…", refreshing: "Refreshing image links…" }[phase];

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-16" aria-labelledby="upload-title">
      <div className="flex flex-wrap justify-between gap-3 border-b border-archive-line pb-5 font-mono text-[11px] text-muted-ink"><span>MOTHFRAME / THE WORKSPACE</span><span>ORIGINAL → TRANSFORM → PRESERVE</span></div>
      <h1 id="upload-title" className="mt-8 font-editorial text-[40px] leading-[1.1] sm:text-[56px]">Give your image a new form.</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-[1.8] text-muted-ink">Crop, resize, rotate, and refine. Shape your image with a considered set of tools, then save a new version.</p>
      {!result && (
        <form onSubmit={processImage} noValidate className="mt-10 grid items-start gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-x-12 lg:gap-y-8" aria-busy={busy}>
          <section aria-labelledby="original-title" className="min-w-0 lg:sticky lg:top-6">
            <h2 id="original-title" className="mb-4 font-mono text-[11px]">01 / ORIGINAL IMAGE</h2>
            <ImageDropzone image={selected} disabled={busy} onSelect={selectImage} onRemove={clearSelection} />
            <p className="mt-4 font-mono text-[11px] text-muted-ink">ORIGINAL PREVIEW · CHANGES APPEAR AFTER PROCESSING</p>
            <p className="mt-3 text-xs leading-relaxed text-muted-ink">Animated images use the first frame. Camera orientation metadata is not applied during processing, so the result may differ from this preview.</p>
          </section>
          <section aria-labelledby="settings-title" className="min-w-0">
            <h2 id="settings-title" className="mb-4 font-mono text-[11px]">02 / DEFINE THE NEW FORM</h2>
            <TransformationControls settings={settings} disabled={busy} onChange={(next) => { setSettings(next); setError(""); }} onReset={() => { setSettings(createDefaultSettings()); setError(""); }} />
          </section>
          <div className="flex flex-col gap-5 border-t border-archive-line pt-6 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
            <div className="max-w-lg text-xs leading-relaxed text-muted-ink">
              <p>Crop → Resize → Flip / Mirror → Rotate → Grayscale → Sepia → Output</p>
              <p className="mt-2">The original is preserved. Each successful process saves a separate version.</p>
              {original && <p className="mt-2">Your original is saved. Retrying uses that original without uploading it again.</p>}
            </div>
            <button type="submit" disabled={!selected || busy} className="flex min-h-12 w-full shrink-0 cursor-pointer items-center justify-between gap-6 rounded-sm bg-ink px-5 py-3 text-sm text-paper hover:bg-ink-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              {busy ? status : original ? "Retry processing" : "Process image"}
              {busy ? <LoaderCircle size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </div>
        </form>
      )}
      <p role="status" aria-atomic="true" className="mt-4 text-sm text-muted-ink">{status}</p>
      <div role="alert" aria-atomic="true">{error && <p className="mt-4 border-l-2 border-ink bg-specimen-paper px-4 py-3 text-sm leading-relaxed">{error}</p>}</div>
      {result && <ProcessingResult key={`${result._id}:${result.urlExpiresAt}:${result.url}`} image={result} refreshing={phase === "refreshing"} onRefresh={refreshLinks} onReset={() => { clearSelection(); setSettings(createDefaultSettings()); }} />}
      <Link to="/dashboard" className="mt-6 inline-flex min-h-11 items-center text-sm underline">Back to dashboard</Link>
    </section>
  );
}

export default Studio;
