import type { ReactNode } from "react";
import { ChevronDown, Crop, FlipHorizontal2, FlipVertical2, Maximize, Palette, RotateCw, SlidersHorizontal, Undo2 } from "lucide-react";
import type { TransformationSettings } from "../../api/images.types";
import { isImageFormat } from "../../utils/images";

interface TransformationControlsProps {
  settings: TransformationSettings;
  disabled: boolean;
  onChange: (settings: TransformationSettings) => void;
  onReset: () => void;
}

const inputClass = "min-h-11 w-full rounded-sm border border-specimen-line bg-paper px-3 text-base disabled:cursor-not-allowed";

function EditorSection({ title, icon, summary, children, open = false }: {
  title: string; icon: ReactNode; summary: string; children: ReactNode; open?: boolean;
}) {
  return (
    <details open={open} className="group rounded-sm border border-archive-line bg-paper">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted-ink">{summary}</span>
        </span>
        <ChevronDown size={15} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-4 border-t border-archive-line px-5 py-5">{children}</div>
    </details>
  );
}

function Toggle({ label, checked, onChange, icon }: {
  label: string; checked: boolean; onChange: (checked: boolean) => void; icon?: ReactNode;
}) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-sm border px-3 py-2 text-sm has-disabled:cursor-not-allowed ${checked ? "border-ink bg-specimen-paper" : "border-archive-line"}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 shrink-0 accent-ink" />
      {icon}<span>{label}</span>
    </label>
  );
}

export default function TransformationControls({ settings, disabled, onChange, onReset }: TransformationControlsProps) {
  const resizeSummary = settings.width || settings.height ? `${settings.width || "Auto"} × ${settings.height || "Auto"} px` : "Original size";
  const orientationCount = Number(Boolean(Number(settings.rotate))) + Number(settings.flip) + Number(settings.mirror);
  const filters = [settings.grayscale && "Grayscale", settings.sepia && "Sepia"].filter(Boolean).join(" + ");

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 disabled:opacity-60">
      <legend className="sr-only">Transformation settings</legend>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-ink">Shape, orient, and finish.</p>
        <button type="button" onClick={onReset} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs underline underline-offset-4 disabled:cursor-not-allowed"><Undo2 size={14} aria-hidden="true" />Reset transformations</button>
      </div>

      <EditorSection title="Resize" icon={<Maximize size={17} aria-hidden="true" />} summary={resizeSummary} open>
        <div className="grid grid-cols-2 gap-4">
          {(["width", "height"] as const).map((dimension) => (
            <div key={dimension}>
              <label htmlFor={`image-${dimension}`} className="mb-2 block text-sm">{dimension === "width" ? "Width" : "Height"} <span className="text-xs text-muted-ink">(optional)</span></label>
              <input id={`image-${dimension}`} type="number" min={1} max={4000} step={1} inputMode="numeric" placeholder="Original" value={settings[dimension]} aria-describedby="resize-help" onChange={(event) => onChange({ ...settings, [dimension]: event.target.value })} className={inputClass} />
            </div>
          ))}
        </div>
        <p id="resize-help" className="text-xs leading-relaxed text-muted-ink">1–4000 pixels. Leave both empty for no resize. One dimension preserves proportions; both crop to fit. If crop is enabled, resizing applies to that crop.</p>
      </EditorSection>

      <EditorSection title="Crop" icon={<Crop size={17} aria-hidden="true" />} summary={settings.cropEnabled ? "Enabled" : "Off"}>
        <Toggle label="Enable crop" checked={settings.cropEnabled} onChange={(cropEnabled) => onChange({ ...settings, cropEnabled })} />
        {settings.cropEnabled && (
          <div className="grid grid-cols-2 gap-4">
            {([
              ["cropWidth", "Crop width", 1, 4000, "Required"],
              ["cropHeight", "Crop height", 1, 4000, "Required"],
              ["cropX", "X · left offset", 0, Number.MAX_SAFE_INTEGER, "0"],
              ["cropY", "Y · top offset", 0, Number.MAX_SAFE_INTEGER, "0"],
            ] as const).map(([field, label, min, max, placeholder]) => (
              <div key={field}>
                <label htmlFor={`image-${field}`} className="mb-2 block text-sm">{label}</label>
                <input id={`image-${field}`} type="number" min={min} max={max} step={1} required={field === "cropWidth" || field === "cropHeight"} inputMode="numeric" value={settings[field]} placeholder={placeholder} aria-describedby="crop-help" onChange={(event) => onChange({ ...settings, [field]: event.target.value })} className={inputClass} />
              </div>
            ))}
          </div>
        )}
        <p id="crop-help" className="text-xs leading-relaxed text-muted-ink">Crop coordinates use the original image dimensions, before resize or rotation. Width and height are required (1–4000 px). X and Y are whole-number offsets from the top-left, defaulting to 0. The rectangle must fit inside the original.</p>
      </EditorSection>

      <EditorSection title="Orientation" icon={<RotateCw size={17} aria-hidden="true" />} summary={orientationCount ? `${orientationCount} active` : "Unchanged"}>
        <div>
          <label htmlFor="image-rotate" className="mb-2 block text-sm">Rotation <span className="text-xs text-muted-ink">(degrees)</span></label>
          <input id="image-rotate" type="number" min={-360} max={360} step="any" placeholder="No rotation" value={settings.rotate} aria-describedby="rotation-help" onChange={(event) => onChange({ ...settings, rotate: event.target.value })} className={inputClass} />
          <div className="mt-3 flex flex-wrap gap-2">
            {[90, 180, 270].map((angle) => <button key={angle} type="button" aria-pressed={Number(settings.rotate) === angle} onClick={() => onChange({ ...settings, rotate: Number(settings.rotate) === angle ? "" : String(angle) })} className="min-h-11 flex-1 cursor-pointer rounded-sm border border-specimen-line px-3 text-sm aria-pressed:border-ink aria-pressed:bg-specimen-paper disabled:cursor-not-allowed">{angle}°</button>)}
            <button type="button" onClick={() => onChange({ ...settings, rotate: "" })} className="min-h-11 cursor-pointer px-2 text-xs underline disabled:cursor-not-allowed">Clear</button>
          </div>
        </div>
        <p id="rotation-help" className="text-xs leading-relaxed text-muted-ink">−360° to 360°, including fractions. Positive rotates clockwise. Other angles expand the canvas with transparency (black in JPEG).</p>
        <Toggle label="Flip vertically" checked={settings.flip} onChange={(flip) => onChange({ ...settings, flip })} icon={<FlipVertical2 size={16} aria-hidden="true" />} />
        <Toggle label="Mirror horizontally" checked={settings.mirror} onChange={(mirror) => onChange({ ...settings, mirror })} icon={<FlipHorizontal2 size={16} aria-hidden="true" />} />
        <p className="text-xs leading-relaxed text-muted-ink">Flip and mirror apply before rotation.</p>
      </EditorSection>

      <EditorSection title="Filters" icon={<Palette size={17} aria-hidden="true" />} summary={filters || "Off"}>
        <Toggle label="Grayscale" checked={settings.grayscale} onChange={(grayscale) => onChange({ ...settings, grayscale })} />
        <Toggle label="Sepia" checked={settings.sepia} onChange={(sepia) => onChange({ ...settings, sepia })} />
        <p className="text-xs leading-relaxed text-muted-ink">Use either filter or both. When combined, grayscale applies first, then sepia adds its warm tones.</p>
      </EditorSection>

      <EditorSection title="Output" icon={<SlidersHorizontal size={17} aria-hidden="true" />} summary={settings.outputEnabled ? `${settings.format.toUpperCase()} · ${settings.quality}` : "Backend defaults"} open>
        <Toggle label="Customize output" checked={settings.outputEnabled} onChange={(outputEnabled) => onChange({ ...settings, outputEnabled })} />
        {settings.outputEnabled ? (
          <>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label htmlFor="image-quality" className="text-sm">Quality</label>
                <output htmlFor="image-quality" className="font-mono text-sm">{settings.quality} / 100</output>
              </div>
              <input id="image-quality" type="range" min={1} max={100} step={1} value={settings.quality} onChange={(event) => onChange({ ...settings, quality: Number(event.target.value) })} className="min-h-8 w-full cursor-pointer accent-ink disabled:cursor-not-allowed" aria-describedby="quality-help" />
              <p id="quality-help" className="mt-2 text-xs leading-relaxed text-muted-ink">Lower quality can reduce file size. Smaller output is not guaranteed.{settings.format === "png" ? " For PNG, quality adjusts the color palette." : ""}</p>
            </div>
            <div>
              <label htmlFor="image-format" className="mb-2 block text-sm">Output format</label>
              <select id="image-format" value={settings.format} onChange={(event) => {
                if (isImageFormat(event.target.value)) onChange({ ...settings, format: event.target.value });
              }} className={inputClass}><option value="webp">WebP</option><option value="jpeg">JPEG</option><option value="png">PNG</option></select>
            </div>
          </>
        ) : <p className="text-xs leading-relaxed text-muted-ink">The backend will use WebP at quality 80. Select at least one transformation above, or enable custom output to create a new version.</p>}
      </EditorSection>
    </fieldset>
  );
}
