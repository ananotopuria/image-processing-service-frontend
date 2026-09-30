import { imageFilename } from "../../utils/imageFilename";
import { Heart } from "lucide-react";
import type { ImageMetadata } from "../../api/images.types";
import { toggleFavorite, useFavorites } from "../../hooks/useFavorites";

export default function FavoriteButton({ image }: { image: ImageMetadata }) {
  const favorites = useFavorites();
  const state = favorites.values.get(image._id);
  const isFavorite = state?.value ?? image.isFavorite;
  return <button type="button" aria-pressed={isFavorite}
    aria-label={`${isFavorite ? "Remove from" : "Add to"} favorites: ${imageFilename(image)}`}
    disabled={Boolean(state?.pending) || favorites.rateLimited}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggleFavorite(image); }}
    className="absolute top-3 right-3 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-sm border border-archive-line bg-paper text-ink hover:bg-specimen-paper focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-50">
    <Heart size={18} fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
  </button>;
}
