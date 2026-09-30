import type { ImageMetadata } from "../api/images.types";
import { tokenStorage } from "../auth/tokenStorage";

type Favorite = { value: boolean; revision: number; pending?: AbortController };
type Snapshot = { values: ReadonlyMap<string, Favorite>; revision: number; pending: number; error: string | null; retryAt: number };

// Memory only, scoped to a token generation (including logout/login with the same token).
export function createFavoriteState() {
  let generation = 0;
  let snapshot: Snapshot = { values: new Map(), revision: 0, pending: 0, error: null, retryAt: 0 };
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    read: () => ({ generation, revision: snapshot.revision }),
    current(ticket: { generation: number }) { return ticket.generation === generation; },
    accept(images: ImageMetadata[], ticket: { generation: number; revision: number }) {
      if (ticket.generation !== generation) return images;
      const values = new Map(snapshot.values);
      const result = images.map((image) => {
        const existing = values.get(image._id);
        if (existing && (existing.pending || existing.revision > ticket.revision)) {
          return { ...image, isFavorite: existing.value };
        }
        values.set(image._id, { value: image.isFavorite, revision: ticket.revision });
        return image;
      });
      publish({ ...snapshot, values });
      return result;
    },
    begin(image: ImageMetadata) {
      if (snapshot.values.get(image._id)?.pending || snapshot.retryAt > Date.now()) return null;
      const previous = snapshot.values.get(image._id)?.value ?? image.isFavorite;
      const controller = new AbortController();
      const revision = snapshot.revision + 1;
      const values = new Map(snapshot.values).set(image._id, { value: !previous, revision, pending: controller });
      publish({ ...snapshot, values, revision, pending: snapshot.pending + 1, error: null });
      return { generation, imageId: image._id, previous, value: !previous, controller };
    },
    finish(request: { generation: number; imageId: string; controller: AbortController }, value: boolean, error: string | null = null) {
      if (request.generation !== generation || snapshot.values.get(request.imageId)?.pending !== request.controller) return;
      const revision = snapshot.revision + 1;
      const values = new Map(snapshot.values).set(request.imageId, { value, revision });
      publish({ ...snapshot, values, revision, pending: snapshot.pending - 1, error: error ?? snapshot.error });
    },
    rateLimit(retryAt: number) { publish({ ...snapshot, retryAt: Math.max(snapshot.retryAt, retryAt) }); },
    clear() {
      generation++;
      for (const entry of snapshot.values.values()) entry.pending?.abort();
      publish({ values: new Map(), revision: 0, pending: 0, error: null, retryAt: 0 });
    },
  };
}

export const favoriteState = createFavoriteState();
tokenStorage.subscribe(() => favoriteState.clear());
