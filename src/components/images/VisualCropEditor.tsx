import ReactCrop from "react-image-crop";
import type { TransformationSettings } from "../../api/images.types";
import { cropFields, initialCrop, percentCropToPixels, pixelsToPercentCrop, settingsCrop } from "../../utils/crop";
import type { EditorImage } from "./ImagePreview";

interface VisualCropEditorProps {
  image: EditorImage;
  settings: TransformationSettings;
  disabled: boolean;
  onChange: (settings: TransformationSettings) => void;
}

export default function VisualCropEditor({ image, settings, disabled, onChange }: VisualCropEditorProps) {
  const crop = settingsCrop(settings, image);
  // Size the actual image, not a letterboxed frame: the cropper must measure pixels only.
  const previewWidth = Math.min(image.width, 352 * image.width / image.height);

  return (
    <div className="min-w-0 space-y-3">
      <p id="visual-crop-help" className="text-xs leading-relaxed text-muted-ink">
        Draw a rectangle, drag it to move, or adjust its handles. You can also tab
        to the selection or a handle and use the arrow keys.
      </p>
      <div className="flex min-w-0 justify-center rounded-sm border border-archive-line bg-specimen-paper p-4" role="group" aria-label="Visual crop editor" aria-describedby="visual-crop-help crop-help">
        <div className="min-w-0" style={{ width: `min(100%, ${previewWidth}px)` }}>
          <ReactCrop
            key={image.url}
            crop={crop ? pixelsToPercentCrop(crop, image) : undefined}
            disabled={disabled}
            ruleOfThirds
            className="specimen-crop ReactCrop--no-animate"
            onChange={(_, percentCrop) => {
              if (!disabled) onChange({ ...settings, ...cropFields(percentCropToPixels(percentCrop, image)) });
            }}
          >
            <img src={image.url} alt="Original image for selecting a crop area" width={image.width} height={image.height} draggable={false} />
          </ReactCrop>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] leading-relaxed text-muted-ink">
          ORIGINAL / {image.width} × {image.height} PX
        </p>
        <button type="button" disabled={disabled} onClick={() => onChange({ ...settings, ...cropFields(initialCrop(image)) })} className="min-h-11 cursor-pointer text-xs underline underline-offset-4 disabled:cursor-not-allowed">
          Reset crop
        </button>
      </div>
      {!crop && <p className="text-xs leading-relaxed text-muted-ink">Draw a selection or reset the crop. Typed coordinates must fit within the original image.</p>}
    </div>
  );
}
