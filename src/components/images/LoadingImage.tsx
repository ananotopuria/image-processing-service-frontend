import { useCallback, useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";

type LoadingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  containerClassName?: string;
  fill?: boolean;
};

// A new source gets its own loading state, including refreshed temporary URLs.
export default function LoadingImage(props: LoadingImageProps) {
  return <ImageLoad key={`${props.src}:${props.srcSet ?? ""}`} {...props} />;
}

function ImageLoad({ containerClassName = "", className = "", fill = false, onLoad, onError, alt, ...props }: LoadingImageProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    // Cached images may finish before React attaches the load handler.
    if (image?.complete) setStatus(image.naturalWidth > 0 ? "ready" : "failed");
  }, []);

  return (
    <span className={`${fill ? "absolute inset-0" : "relative"} block min-w-0 ${containerClassName}`} aria-busy={status === "loading"}>
      <img {...props} ref={imageRef} alt={alt}
        onLoad={(event) => { setStatus("ready"); onLoad?.(event); }}
        onError={(event) => { setStatus("failed"); onError?.(event); }}
        className={`${className} motion-safe:transition-opacity motion-safe:duration-300 ${status === "ready" ? "opacity-100" : "opacity-0"}`}
      />
      {status === "loading" && <span aria-hidden="true" className="image-skeleton pointer-events-none absolute inset-0 overflow-hidden rounded-sm border border-archive-line/50 bg-specimen-paper">
        <span className="absolute inset-x-[15%] top-1/2 h-px bg-archive-line/60" />
        <span className="absolute inset-y-[15%] left-1/2 w-px bg-archive-line/60" />
      </span>}
      {status === "failed" && <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-specimen-paper p-3 text-center text-xs text-muted-ink">
        <ImageOff size={22} strokeWidth={1} aria-hidden="true" />
        <span>Image unavailable</span>
      </span>}
    </span>
  );
}
