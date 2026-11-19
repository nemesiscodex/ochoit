import type { TrackId } from "ochoit-lib";

import type { RecordTrackId } from "@/features/sequencer/quantized-recorder";
import type { GridMetrics } from "@/features/sequencer/step-drag";

// What a lane asks the matrix to do; lanes get one stable dispatcher so they can stay memoized.
export type RowAction =
  | { type: "preview-step"; trackId: TrackId; stepIndex: number }
  | { type: "select-step"; trackId: TrackId; stepIndex: number; shiftKey: boolean }
  | { type: "deselect" }
  | { type: "start-move"; trackId: TrackId; stepIndex: number; metrics: GridMetrics; shiftKey: boolean }
  | { type: "start-resize"; trackId: TrackId; stepIndex: number; edge: "left" | "right"; metrics: GridMetrics }
  | { type: "move-drag"; clientX: number; clientY: number }
  | { type: "end-drag" }
  | { type: "toggle-recording"; trackId: RecordTrackId };

export type DragPreview = "valid" | "invalid" | null;
