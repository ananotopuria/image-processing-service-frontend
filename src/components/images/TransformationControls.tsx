import type { TransformationSettings } from "../../api/images.types";
import { isImageFormat } from "../../utils/images";

interface TransformationControlsProps {
  settings: TransformationSettings;
  disabled: boolean;
  onChange: (settings: TransformationSettings) => void;
}

export default function TransformationControls({ settings, disabled, onChange }: TransformationControlsProps) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-7 disabled:opacity-60">
      <legend className="sr-only">Transformation settings</legend>
      <div>
        <div className="grid grid-cols-2 gap-4">
          {(["width", "height"] as const).map((dimension) => (
            <div key={dimension}>
              <label htmlFor={`image-${dimension}`} className="mb-2 block text-sm">{dimension === "width" ? "Width" : "Height"} <span className="text-xs text-muted-ink">(optional)</span></label>
              <input
                id={`image-${dimension}`}
                type="number"
                min={1}
                max={4000}
                step={1}
                inputMode="numeric"
                placeholder="Original"
                value={settings[dimension]}
                aria-describedby="resize-help"
                onChange={(event) => onChange({ ...settings, [dimension]: event.target.value })}
                className="min-h-12 w-full rounded-sm border border-specimen-line bg-paper px-3 text-base disabled:cursor-not-allowed"
              />
            </div>
          ))}
        </div>
        <p id="resize-help" className="mt-3 text-xs leading-relaxed text-muted-ink">1–4000 pixels. Leave both empty to keep the original dimensions. Set one to preserve proportions; setting both crops the image to fit.</p>
      </div>
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
        }} className="min-h-12 w-full rounded-sm border border-specimen-line bg-paper px-3 text-base disabled:cursor-not-allowed">
          <option value="webp">WebP</option><option value="jpeg">JPEG</option><option value="png">PNG</option>
        </select>
        <p className="mt-3 text-xs leading-relaxed text-muted-ink">The original file is preserved. Processing creates a separate version.</p>
      </div>
    </fieldset>
  );
}
