import { useSyncExternalStore } from "react";
import { sharingState } from "./state";
export const useSharing = () => useSyncExternalStore(sharingState.subscribe, sharingState.getSnapshot, sharingState.getSnapshot);
