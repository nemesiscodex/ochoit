import { cn } from "@ochoit/ui/lib/utils";
import {
  getMelodicArrangementEntries,
  getMelodicStepState,
  getNoiseTriggerPresetForStep,
  type MelodicStepState,
  type SongDocument,
  type Track,
  type TrackId,
} from "ochoit-lib";
import { memo, useMemo, useRef, type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import type { PlayheadStore } from "@/features/audio/playhead-store";
import { usePlayheadSelector } from "@/features/audio/use-playhead-selector";
import type { StepDrag } from "@/features/sequencer/step-drag";
import { labelByTrackId } from "@/components/sequencer-theme";
import {
  beatEdgeClass,
  getGridMetrics,
  rowStartGutterClass,
  stepGridClass,
  stepRowsClass,
  stepsPerBeatGroup,
  useStepColumnCount,
} from "@/components/sequencer/grid-geometry";
import type { DragPreview, RowAction } from "@/components/sequencer/row-action";

const noSelectedStepIndexSet: ReadonlySet<number> = new Set();
const gridCellChunkSize = 16;

const cellTextClass = "font-mono text-[13px] font-semibold leading-none max-md:text-[12px]";
const cellBaseClass = `relative flex min-w-0 cursor-pointer touch-manipulation items-center justify-center rounded-[4px] border select-none transition-[background-color,border-color] duration-100 focus-visible:z-20 ${cellTextClass}`;
// Resting notes stay flat; only the selection and the playhead glow.
const filledClass = "border-(--voice) bg-(--voice)/13 text-[color-mix(in_srgb,var(--voice)_82%,white)]";
const selectedFilledClass =
  "border-[1.5px] border-(--voice) bg-(--voice) text-voice-ink shadow-[0_0_16px_1px_color-mix(in_srgb,var(--voice)_70%,transparent)] [text-shadow:none]";
const selectedEmptyClass =
  "border-[1.5px] border-(--voice) bg-(--voice)/22 shadow-[0_0_12px_color-mix(in_srgb,var(--voice)_55%,transparent)]";
const playheadClass =
  "after:pointer-events-none after:absolute after:-inset-x-[3px] after:-inset-y-[3px] after:z-10 after:rounded-[3px] after:beam";

function emptyCellClass(index: number) {
  return index % stepsPerBeatGroup === 0
    ? "border-screen-muted/75 bg-screen-edge/15 text-screen-ink/85 hover:bg-screen-edge/30"
    : "border-screen-edge bg-screen-edge/8 text-screen-muted hover:bg-screen-edge/25";
}

function StepNumber({ index, left }: { index: number; left?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-[4px] font-mono text-[10px] leading-none font-medium",
        left === undefined && "left-[5px]",
        index % stepsPerBeatGroup !== 0 && "opacity-90",
      )}
      style={left === undefined ? undefined : { left }}
    >
      {index + 1}
    </span>
  );
}

function RowStartGutter({ columnCount, rowCount }: { columnCount: number; rowCount: number }) {
  if (rowCount === 1) {
    return null;
  }

  return (
    <div aria-hidden className={cn("grid gap-1", rowStartGutterClass, stepRowsClass(rowCount))}>
      {Array.from({ length: rowCount }, (_, row) => (
        <span
          key={row * columnCount}
          className="flex items-center justify-end font-mono text-[10px] leading-none font-medium text-screen-muted"
        >
          {row * columnCount + 1}
        </span>
      ))}
    </div>
  );
}

type TriggerCellData = {
  enabled: boolean;
  label: string;
  volume: number;
};

function getTriggerCellData(
  track: Extract<Track, { kind: "noise" | "sample" }>,
  engineMode: SongDocument["meta"]["engineMode"],
  stepIndex: number,
  samples: SongDocument["samples"],
): TriggerCellData {
  if (track.kind === "noise") {
    const step = track.steps[stepIndex];

    return {
      enabled: step.enabled,
      label: step.enabled ? (getNoiseTriggerPresetForStep(step)?.shortLabel ?? step.mode) : "",
      volume: step.volume,
    };
  }

  const step = track.steps[stepIndex];
  const sample = step.sampleId === null ? null : (samples.find((entry) => entry.id === step.sampleId) ?? null);

  return {
    enabled: step.enabled,
    label: !step.enabled ? "" : engineMode === "inspired" ? step.note : (sample?.name ?? "PCM"),
    volume: step.volume,
  };
}

type MelodicArrangementPreviewEntry = {
  stepIndex: number;
  length: number;
  label: string;
  volume: number;
  isPreview: boolean;
  isPreviewInvalid: boolean;
};

type MelodicSegment = {
  originStepIndex: number;
  segmentStepIndex: number;
  rowIndex: number;
  columnStart: number;
  columnSpan: number;
  isFirstSegment: boolean;
  isLastSegment: boolean;
  label: string;
  volume: number;
  isPreview: boolean;
  isPreviewInvalid: boolean;
};

export const CompactStepGrid = memo(function CompactStepGrid({
  dragState,
  engineMode,
  isPlaying,
  onRowAction,
  playhead,
  samples,
  selectedStepIndexes,
  track,
}: {
  dragState: StepDrag | null;
  engineMode: SongDocument["meta"]["engineMode"];
  isPlaying: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  samples: SongDocument["samples"];
  selectedStepIndexes: readonly number[];
  track: Track;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columnCount = useStepColumnCount();
  const selectedStepIndexSet = useMemo(() => new Set(selectedStepIndexes), [selectedStepIndexes]);
  const melodicTrack = track.kind === "pulse" || track.kind === "triangle" ? track : null;
  const triggerTrack = track.kind === "noise" || track.kind === "sample" ? track : null;
  const melodicStepStates = useMemo(
    () => (melodicTrack === null ? [] : melodicTrack.steps.map((_, index) => getMelodicStepState(melodicTrack, index))),
    [melodicTrack],
  );
  const noteSegments = useMemo(
    () =>
      melodicTrack === null
        ? []
        : getMelodicArrangementEntries(melodicTrack).flatMap((entry) =>
            getMelodicSegments(
              {
                stepIndex: entry.stepIndex,
                length: entry.length,
                label: entry.note,
                volume: melodicTrack.steps[entry.stepIndex]?.volume ?? 0,
                isPreview: false,
                isPreviewInvalid: false,
              },
              columnCount,
            ),
          ),
    [melodicTrack, columnCount],
  );
  const previewSegments = useMemo(
    () =>
      melodicTrack === null
        ? []
        : getMelodicPreviewEntries(melodicTrack, dragState).flatMap((entry) => getMelodicSegments(entry, columnCount)),
    [melodicTrack, dragState, columnCount],
  );
  // The note layer sees the selection only while it holds a note, so moving it between empty cells skips that layer.
  const noteSelection = selectedStepIndexes.some((index) => melodicStepStates[index]?.kind === "start")
    ? selectedStepIndexSet
    : noSelectedStepIndexSet;
  const triggerCells = useMemo(
    () =>
      triggerTrack === null
        ? []
        : triggerTrack.steps.map((_, index) => getTriggerCellData(triggerTrack, engineMode, index, samples)),
    [triggerTrack, engineMode, samples],
  );
  const gridLabel = `${labelByTrackId[track.id]} steps`;
  const rowCount = Math.ceil(track.steps.length / columnCount);
  const rowsClass = stepRowsClass(rowCount);

  if (melodicTrack !== null) {
    // Separate memoized layers: a drag move re-renders only the preview layer, and a step edit or
    // selection change leaves the layer it does not touch alone.
    return (
      <div className="flex gap-1">
        <RowStartGutter columnCount={columnCount} rowCount={rowCount} />
        <div ref={gridRef} className="relative min-w-0 flex-1" role="group" aria-label={gridLabel} data-step-grid="">
          <MelodicGridCellLayer
            isPlaying={isPlaying}
            rowsClass={rowsClass}
            onRowAction={onRowAction}
            playhead={playhead}
            selectedStepIndexSet={selectedStepIndexSet}
            stepStates={melodicStepStates}
            trackId={track.id}
          />
          <div
            className={cn("pointer-events-none absolute inset-0", stepGridClass)}
            style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
          >
            <MelodicSegmentLayer
              gridRef={gridRef}
              isPlaying={isPlaying}
              onRowAction={onRowAction}
              playhead={playhead}
              segments={noteSegments}
              selectedStepIndexSet={noteSelection}
              trackId={track.id}
            />
            <MelodicSegmentLayer
              gridRef={gridRef}
              isPlaying={isPlaying}
              onRowAction={onRowAction}
              playhead={playhead}
              segments={previewSegments}
              selectedStepIndexSet={noSelectedStepIndexSet}
              trackId={track.id}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <RowStartGutter columnCount={columnCount} rowCount={rowCount} />
      <div
        ref={gridRef}
        className={cn(stepGridClass, rowsClass, "min-w-0 flex-1")}
        role="group"
        aria-label={gridLabel}
        data-step-grid=""
      >
        {triggerCells.map((cellData, index) => {
          const isDragPreview =
            dragState?.mode === "move" &&
            dragState.isActive &&
            dragState.initialSelectedStepIndexes.includes(index - dragState.delta);

          return (
            <TriggerStepCell
              key={`${track.id}-step-${index}`}
              columnCount={columnCount}
              dragPreview={isDragPreview ? (dragState.isValid ? "valid" : "invalid") : null}
              enabled={cellData.enabled}
              gridRef={gridRef}
              index={index}
              isPlaying={isPlaying}
              isSelected={selectedStepIndexSet.has(index)}
              label={cellData.label}
              onRowAction={onRowAction}
              playhead={playhead}
              trackId={track.id}
              volume={cellData.volume}
            />
          );
        })}
      </div>
    </div>
  );
});

function VolumeBar({ volume, width = "100%" }: { volume: number; width?: string }) {
  return (
    <span aria-hidden className="absolute bottom-[5px] left-[5px] h-[3px] rounded-full bg-current/25" style={{ width: `calc(${width} - 10px)` }}>
      <span className="block h-full rounded-full bg-current" style={{ width: `${volume * 100}%` }} />
    </span>
  );
}

const TriggerStepCell = memo(function TriggerStepCell({
  columnCount,
  dragPreview,
  enabled,
  gridRef,
  index,
  isPlaying,
  isSelected,
  label,
  onRowAction,
  playhead,
  trackId,
  volume,
}: {
  columnCount: number;
  dragPreview: DragPreview;
  enabled: boolean;
  gridRef: RefObject<HTMLDivElement | null>;
  index: number;
  isPlaying: boolean;
  isSelected: boolean;
  label: string;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  trackId: TrackId;
  volume: number;
}) {
  const isActive = usePlayheadSelector(playhead, ({ nextStep }) => isPlaying && nextStep === index);
  const startDrag = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onRowAction({
      type: "start-move",
      trackId,
      stepIndex: index,
      metrics: getGridMetrics(event.currentTarget, gridRef.current, columnCount, event.clientX, event.clientY),
      shiftKey: event.shiftKey,
    });
  };
  const moveDrag = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onRowAction({ type: "move-drag", clientX: event.clientX, clientY: event.clientY });
  };
  const endDrag = () => {
    onRowAction({ type: "end-drag" });
  };

  return (
    <button
      type="button"
      data-step-index={index}
      aria-current={isActive ? "step" : undefined}
      aria-label={`${labelByTrackId[trackId]} step ${index + 1}`}
      aria-selected={isSelected || undefined}
      className={cn(
        cellBaseClass,
        beatEdgeClass(index),
        enabled ? (isSelected ? selectedFilledClass : filledClass) : isSelected ? selectedEmptyClass : emptyCellClass(index),
        dragPreview === "valid" && "outline-2 outline-offset-1 outline-ink/60 outline-dashed",
        dragPreview === "invalid" && "bg-signal/15 outline-2 outline-offset-1 outline-signal outline-dashed",
        isActive && playheadClass,
      )}
      onMouseEnter={() => {
        onRowAction({ type: "preview-step", trackId, stepIndex: index });
      }}
      onClick={(event) => {
        onRowAction({ type: "select-step", trackId, stepIndex: index, shiftKey: event.shiftKey });
      }}
      onMouseDown={startDrag}
      onMouseMove={moveDrag}
      onMouseUp={endDrag}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
    >
      <StepNumber index={index} />
      {enabled ? (
        <>
          <span className="max-w-full truncate px-1 pt-1.5">{label}</span>
          <VolumeBar volume={volume} />
        </>
      ) : null}
    </button>
  );
});

const MelodicGridCellLayer = memo(function MelodicGridCellLayer({
  isPlaying,
  rowsClass,
  onRowAction,
  playhead,
  selectedStepIndexSet,
  stepStates,
  trackId,
}: {
  isPlaying: boolean;
  rowsClass: string;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  selectedStepIndexSet: ReadonlySet<number>;
  stepStates: readonly MelodicStepState[];
  trackId: TrackId;
}) {
  const cellStates = stepStates
    .map((stepState, index) => (stepState.kind !== "rest" ? "n" : selectedStepIndexSet.has(index) ? "s" : "."))
    .join("");
  const chunkStarts = Array.from(
    { length: Math.ceil(cellStates.length / gridCellChunkSize) },
    (_, chunk) => chunk * gridCellChunkSize,
  );

  return (
    <div className={cn(stepGridClass, rowsClass)}>
      {chunkStarts.map((start) => (
        <MelodicGridCellChunk
          key={start}
          cellStates={cellStates.slice(start, start + gridCellChunkSize)}
          isPlaying={isPlaying}
          onRowAction={onRowAction}
          playhead={playhead}
          start={start}
          trackId={trackId}
        />
      ))}
    </div>
  );
});

// `cellStates` has one character per cell ("n" under a note, "s" selected, "." free). A string compares by value,
// so an edit or selection change re-renders only the chunks whose cells it changes.
const MelodicGridCellChunk = memo(function MelodicGridCellChunk({
  cellStates,
  isPlaying,
  onRowAction,
  playhead,
  start,
  trackId,
}: {
  cellStates: string;
  isPlaying: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  start: number;
  trackId: TrackId;
}) {
  return Array.from(cellStates, (cellState, offset) => (
    <MelodicGridCell
      key={`${trackId}-grid-cell-${start + offset}`}
      index={start + offset}
      isOccupiedByNote={cellState === "n"}
      isPlaying={isPlaying}
      isSelected={cellState === "s"}
      onRowAction={onRowAction}
      playhead={playhead}
      trackId={trackId}
    />
  ));
});

const MelodicSegmentLayer = memo(function MelodicSegmentLayer({
  gridRef,
  isPlaying,
  onRowAction,
  playhead,
  segments,
  selectedStepIndexSet,
  trackId,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  segments: readonly MelodicSegment[];
  selectedStepIndexSet: ReadonlySet<number>;
  trackId: TrackId;
}) {
  return segments.map((segment) => (
    <MelodicNoteBlock
      key={`${trackId}-${segment.originStepIndex}-${segment.rowIndex}-${segment.columnStart}-${segment.isPreview ? "preview" : "note"}`}
      {...segment}
      gridRef={gridRef}
      isPlaying={isPlaying}
      isSelected={!segment.isPreview && selectedStepIndexSet.has(segment.originStepIndex)}
      onRowAction={onRowAction}
      playhead={playhead}
      trackId={trackId}
    />
  ));
});

const MelodicGridCell = memo(function MelodicGridCell({
  index,
  isOccupiedByNote,
  isPlaying,
  isSelected,
  onRowAction,
  playhead,
  trackId,
}: {
  index: number;
  isOccupiedByNote: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  trackId: TrackId;
}) {
  const isActive = usePlayheadSelector(
    playhead,
    ({ nextStep }) => isPlaying && !isOccupiedByNote && nextStep === index,
  );

  return (
    <button
      type="button"
      data-step-index={index}
      aria-hidden={isOccupiedByNote}
      tabIndex={isOccupiedByNote ? -1 : undefined}
      aria-current={isActive ? "step" : undefined}
      aria-label={isOccupiedByNote ? undefined : `${labelByTrackId[trackId]} step ${index + 1}`}
      aria-selected={isSelected ? true : undefined}
      className={cn(
        cellBaseClass,
        beatEdgeClass(index),
        isOccupiedByNote ? "pointer-events-none invisible" : isSelected ? selectedEmptyClass : emptyCellClass(index),
        isActive && playheadClass,
      )}
      onMouseEnter={() => {
        onRowAction({ type: "preview-step", trackId, stepIndex: index });
      }}
      onClick={(event) => {
        onRowAction({ type: "select-step", trackId, stepIndex: index, shiftKey: event.shiftKey });
      }}
    >
      {isOccupiedByNote ? null : <StepNumber index={index} />}
    </button>
  );
});

const MelodicNoteBlock = memo(function MelodicNoteBlock({
  gridRef,
  isPlaying,
  isSelected,
  onRowAction,
  playhead,
  trackId,
  ...segment
}: MelodicSegment & {
  gridRef: RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  isSelected: boolean;
  onRowAction: (action: RowAction) => void;
  playhead: PlayheadStore;
  trackId: TrackId;
}) {
  const isActive = usePlayheadSelector(
    playhead,
    ({ nextStep }) =>
      isPlaying && nextStep >= segment.segmentStepIndex && nextStep < segment.segmentStepIndex + segment.columnSpan,
  );
  const stepName = `${labelByTrackId[trackId]} step ${segment.originStepIndex + 1}`;
  const startMove = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (segment.isPreview) {
      return;
    }

    onRowAction({
      type: "start-move",
      trackId,
      stepIndex: segment.originStepIndex,
      metrics: getGridMetrics(event.currentTarget, gridRef.current, undefined, event.clientX, event.clientY),
      shiftKey: event.shiftKey,
    });
  };
  const moveDrag = (event: ReactMouseEvent<HTMLButtonElement>) => {
    onRowAction({ type: "move-drag", clientX: event.clientX, clientY: event.clientY });
  };
  const endDrag = () => {
    onRowAction({ type: "end-drag" });
  };
  const startResize = (event: ReactMouseEvent<HTMLSpanElement>, edge: "left" | "right") => {
    event.stopPropagation();
    onRowAction({
      type: "start-resize",
      trackId,
      stepIndex: segment.originStepIndex,
      edge,
      metrics: getGridMetrics(event.currentTarget, gridRef.current, undefined, event.clientX, event.clientY),
    });
  };
  const canResize = !segment.isPreview;

  return (
    <button
      type="button"
      data-note-origin-step={segment.originStepIndex}
      aria-current={isActive ? "step" : undefined}
      aria-label={segment.isFirstSegment ? stepName : `${stepName} continuation`}
      aria-selected={isSelected || undefined}
      className={cn(
        "pointer-events-auto relative z-10 flex h-full min-w-0 cursor-grab touch-manipulation items-center rounded-[4px] border select-none focus-visible:z-20",
        cellTextClass,
        segment.columnSpan === 1 ? "justify-center" : "justify-start px-2",
        beatEdgeClass(segment.segmentStepIndex, segment.segmentStepIndex + segment.columnSpan - 1),
        segment.isPreview
          ? segment.isPreviewInvalid
            ? "border-transparent bg-signal/15 text-ink outline-2 -outline-offset-2 outline-signal outline-dashed"
            : "border-transparent bg-surface-2/70 text-ink outline-2 -outline-offset-2 outline-ink/60 outline-dashed"
          : isSelected
            ? selectedFilledClass
            : filledClass,
        !segment.isFirstSegment && "rounded-l-none border-l-0",
        !segment.isLastSegment && "rounded-r-none border-r-0",
      )}
      style={{ gridColumn: `${segment.columnStart} / span ${segment.columnSpan}`, gridRow: segment.rowIndex + 1 }}
      onMouseEnter={() => {
        onRowAction({ type: "preview-step", trackId, stepIndex: segment.originStepIndex });
      }}
      onClick={(event) => {
        onRowAction({ type: "select-step", trackId, stepIndex: segment.originStepIndex, shiftKey: event.shiftKey });
      }}
      onPointerDown={startMove}
      onMouseDown={startMove}
      onPointerMove={moveDrag}
      onMouseMove={moveDrag}
      onPointerUp={endDrag}
      onMouseUp={endDrag}
    >
      {isActive ? (
        <PlayheadSweep columnSpan={segment.columnSpan} playhead={playhead} segmentStepIndex={segment.segmentStepIndex} />
      ) : null}
      {segment.isPreview
        ? null
        : Array.from({ length: segment.columnSpan }, (_, offset) => (
            <StepNumber
              key={segment.segmentStepIndex + offset}
              index={segment.segmentStepIndex + offset}
              left={`calc(${(100 / segment.columnSpan) * offset}% + 5px)`}
            />
          ))}
      {segment.isFirstSegment ? <span className="relative truncate pt-1.5">{segment.label}</span> : null}
      {segment.isFirstSegment && !segment.isPreview ? (
        <VolumeBar volume={segment.volume} width={`${100 / segment.columnSpan}%`} />
      ) : null}
      {canResize && segment.isFirstSegment ? (
        <ResizeHandle
          edge="left"
          label={`Resize start of ${stepName}`}
          onStart={(event) => {
            startResize(event, "left");
          }}
        />
      ) : null}
      {canResize && segment.isLastSegment ? (
        <ResizeHandle
          edge="right"
          label={`Resize end of ${stepName}`}
          onStart={(event) => {
            startResize(event, "right");
          }}
        />
      ) : null}
    </button>
  );
});

// Pointer-only: the step editor's Shorten and Extend buttons are the keyboard path, so the handle stays out of the
// accessibility tree instead of nesting a second button inside the note.
function ResizeHandle({
  edge,
  label,
  onStart,
}: {
  edge: "left" | "right";
  label: string;
  onStart: (event: ReactMouseEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      aria-hidden
      data-resize-handle={label}
      className={cn(
        "absolute inset-y-0 w-2.5 cursor-ew-resize after:absolute after:inset-y-2 after:w-0.5 after:rounded-full after:bg-current/0 after:transition-colors hover:after:bg-current/60",
        edge === "left" ? "left-0 after:left-1" : "right-0 after:right-1",
      )}
      onPointerDown={onStart}
      onMouseDown={onStart}
    />
  );
}

// Mounted only while the playhead is inside the segment, so a step within a note re-renders just this box.
const PlayheadSweep = memo(function PlayheadSweep({
  columnSpan,
  playhead,
  segmentStepIndex,
}: {
  columnSpan: number;
  playhead: PlayheadStore;
  segmentStepIndex: number;
}) {
  const offset = usePlayheadSelector(playhead, ({ nextStep }) => nextStep - segmentStepIndex);

  return (
    <div
      aria-hidden="true"
      className="beam pointer-events-none absolute inset-y-0 rounded-[3px]"
      style={{ width: `${100 / columnSpan}%`, left: `${(100 / columnSpan) * offset}%` }}
    />
  );
});

function getMelodicPreviewEntries(
  track: Extract<Track, { kind: "pulse" | "triangle" }>,
  dragState: StepDrag | null,
): MelodicArrangementPreviewEntry[] {
  if (dragState === null || !dragState.isActive || dragState.trackId !== track.id) {
    return [];
  }

  if (dragState.mode === "move") {
    if (dragState.delta === 0) {
      return [];
    }

    return dragState.initialSelectedStepIndexes.flatMap((stepIndex) => {
      const step = track.steps[stepIndex];

      return step?.enabled
        ? [
            {
              stepIndex: stepIndex + dragState.delta,
              length: step.length,
              label: step.note,
              volume: step.volume,
              isPreview: true,
              isPreviewInvalid: !dragState.isValid,
            },
          ]
        : [];
    });
  }

  const step = track.steps[dragState.originStepIndex];

  return step?.enabled
    ? [
        {
          stepIndex: dragState.previewStartStepIndex,
          length: dragState.previewLength,
          label: step.note,
          volume: step.volume,
          isPreview: true,
          isPreviewInvalid: false,
        },
      ]
    : [];
}

function getMelodicSegments(entry: MelodicArrangementPreviewEntry, columns: number): MelodicSegment[] {
  if (entry.stepIndex < 0 || entry.length <= 0) {
    return [];
  }

  const segments: MelodicSegment[] = [];
  let currentIndex = entry.stepIndex;
  let remainingLength = entry.length;
  let segmentIndex = 0;

  while (remainingLength > 0) {
    const columnSpan = Math.min(remainingLength, columns - (currentIndex % columns));

    segments.push({
      originStepIndex: entry.stepIndex,
      segmentStepIndex: currentIndex,
      rowIndex: Math.floor(currentIndex / columns),
      columnStart: (currentIndex % columns) + 1,
      columnSpan,
      isFirstSegment: segmentIndex === 0,
      isLastSegment: remainingLength === columnSpan,
      label: entry.label,
      volume: entry.volume,
      isPreview: entry.isPreview,
      isPreviewInvalid: entry.isPreviewInvalid,
    });

    currentIndex += columnSpan;
    remainingLength -= columnSpan;
    segmentIndex += 1;
  }

  return segments;
}
