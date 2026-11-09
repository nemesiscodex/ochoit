import { useSyncExternalStore } from "react";

import type { Playhead, PlayheadStore } from "@/features/audio/playhead-store";

/** Primitive results only: React compares snapshots with Object.is, so a fresh object would re-render forever. */
type PlayheadSelection = boolean | number | null;

export function usePlayheadSelector<Selection extends PlayheadSelection>(
  store: PlayheadStore,
  selector: (playhead: Playhead) => Selection,
): Selection {
  const getSelection = () => selector(store.get());

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
