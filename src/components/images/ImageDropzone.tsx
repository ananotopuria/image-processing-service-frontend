import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { IMAGE_ACCEPT } from "../../utils/images";
import ImagePreview, { type SelectedImage } from "./ImagePreview";

interface ImageDropzoneProps {
  image: SelectedImage | null;
  disabled: boolean;
  onSelect: (files: File[]) => void;
  onRemove: () => void;
}

export default function ImageDropzone({ image, disabled, onSelect, onRemove }: ImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const dragActive = isDragging && !disabled;
  return (
    <div
      className={`group min-w-0 border border-dashed transition-colors duration-150 motion-reduce:transition-none ${dragActive ? "border-ink bg-specimen-paper" : "border-specimen-line bg-specimen-paper/40"} ${disabled ? "" : "hover:border-ink focus-within:border-ink"}`}
      onDragEnter={(event) => {
        if (disabled || !Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        if (!disabled && event.dataTransfer.files.length) onSelect(Array.from(event.dataTransfer.files));
      }}
    >
      {image ? <ImagePreview image={image} /> : (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 pt-10 text-center sm:min-h-80">
          <div aria-hidden="true" className="relative grid size-20 place-items-center">
            <span className="absolute inset-0 translate-x-1 translate-y-1 border border-archive-line bg-specimen-paper" />
            <span className={`relative grid size-20 place-items-center border border-specimen-line bg-paper transition-transform duration-150 ease-out motion-reduce:transition-none ${dragActive ? "motion-safe:-translate-y-1" : disabled ? "" : "motion-safe:group-hover:-translate-y-1 motion-safe:group-focus-within:-translate-y-1"}`}>
              <ImagePlus size={32} strokeWidth={1} />
            </span>
          </div>
          <h3 className="mt-5 font-editorial text-3xl">{dragActive ? "Release your specimen." : "Introduce your image."}</h3>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-ink">Drag an image here, or choose a file below.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3 px-5 py-5">
        <input
          id="image-file"
          type="file"
          accept={IMAGE_ACCEPT}
          disabled={disabled}
          className="peer sr-only"
          aria-describedby="file-requirements"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (files.length) onSelect(files);
          }}
        />
        <label htmlFor="image-file" className="inline-flex min-h-11 cursor-pointer items-center rounded-sm border border-ink px-5 py-2 text-sm hover:bg-paper peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4">
          {image ? "Replace image" : "Choose image"}
        </label>
        {image && <button type="button" disabled={disabled} onClick={onRemove} className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm underline disabled:cursor-not-allowed disabled:opacity-50"><X size={16} aria-hidden="true" /> Remove</button>}
      </div>
      <p id="file-requirements" className="px-5 pb-6 text-center font-mono text-[11px] leading-relaxed text-muted-ink">JPEG / PNG / WEBP · LESS THAN 5 MiB</p>
    </div>
  );
}
