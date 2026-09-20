import { formatFileSize } from "../../utils/images";

export interface SelectedImage {
  file: File;
  url: string;
  mimeType: string;
}

export default function ImagePreview({ image }: { image: SelectedImage }) {
  return (
    <figure className="min-w-0">
      <div className="flex min-h-56 items-center justify-center bg-paper p-4 sm:min-h-80">
        <img src={image.url} alt={`Original preview: ${image.file.name}`} className="max-h-96 max-w-full object-contain" />
      </div>
      <figcaption className="border-t border-archive-line p-5 text-left">
        <p className="wrap-anywhere text-sm font-semibold">{image.file.name}</p>
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-xs text-muted-ink">
          <div><dt className="font-mono">TYPE</dt><dd className="mt-1">{image.mimeType}</dd></div>
          <div><dt className="font-mono">ORIGINAL SIZE</dt><dd className="mt-1">{formatFileSize(image.file.size)}</dd></div>
        </dl>
      </figcaption>
    </figure>
  );
}
