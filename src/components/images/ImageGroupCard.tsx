import type { ImageMetadata } from "../../api/images.types";
import type { ImageGroup } from "../../utils/imageHistory";
import ImageHistoryItem from "./ImageHistoryItem";

export default function ImageGroupCard({ group, deleteDisabled, onDelete }: {
  group: ImageGroup; deleteDisabled: boolean; onDelete: (image: ImageMetadata) => void;
}) {
  const primary = group.original ?? group.standalone ?? group.versions[0];
  const remaining = group.original ? group.versions : group.versions.slice(1);
  return (
    <article className="min-w-0 self-start overflow-hidden rounded-sm border border-archive-line bg-paper">
      {!group.original && group.versions.length > 0 && <p className="border-b border-archive-line px-5 py-3 text-xs leading-relaxed text-muted-ink">The original is not on this page. Showing {group.versions.length} linked {group.versions.length === 1 ? "version" : "versions"} from this page.</p>}
      {group.standalone?.kind === "transformed" && <p className="border-b border-archive-line px-5 py-3 text-xs text-muted-ink">This version has no available original reference.</p>}
      <ImageHistoryItem key={`${primary._id}:${primary.urlExpiresAt}`} image={primary} deleteDisabled={deleteDisabled} onDelete={onDelete} />
      {remaining.length > 0 ? <details className="border-t border-archive-line">
        <summary className="min-h-12 cursor-pointer bg-specimen-paper/50 px-5 py-4 text-sm">{group.original ? "View versions" : "More linked versions"} ({remaining.length}) <span className="text-xs text-muted-ink">on this page</span></summary>
        <div className="divide-y divide-archive-line border-t border-archive-line">
          {remaining.map((image) => <ImageHistoryItem key={`${image._id}:${image.urlExpiresAt}`} image={image} deleteDisabled={deleteDisabled} onDelete={onDelete} />)}
        </div>
      </details> : group.original && <p className="border-t border-archive-line px-5 py-4 text-xs text-muted-ink">No transformed versions on this page.</p>}
    </article>
  );
}
