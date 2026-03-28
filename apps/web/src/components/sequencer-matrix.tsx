import { Button } from "@ochoit/ui/components/button";
import { cn } from "@ochoit/ui/lib/utils";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import type { AudioEngine } from "@/features/audio/audio-engine";
import { getFrequencyForNote } from "@/features/audio/note-frequency";
import { previewWaveformByTrackId } from "@/features/audio/waveform-data";
import { useTrackWaveform } from "@/features/audio/use-track-waveform";
import {
  type SongDocument,
  type Track,
  type TrackId,
  getOrderedTracks,
  trackOrder,
} from "@/features/song/song-document";
import { TRACK_VOLUME_PERCENT_RANGE, toTrackVolumePercent } from "@/features/song/song-mixer";
import {
  getDefaultSampleTrigger,
  type MelodicArrangementEntry,
  getMelodicArrangementEntries,
  moveMelodicTrackEntries,
  moveNoiseTrackEntries,
  moveSampleTrackEntries,
  getMelodicStepState,
  getNoiseTriggerPresetForStep,
  type MelodicStepUpdates,
  type MelodicTrackId,
  type NoiseStepUpdates,
  type NoteValue,
  type SampleStepUpdates,
  type TriggerTrackId,
} from "@/features/song/song-pattern";
import { SONG_LOOP_LENGTH_RANGE } from "@/features/song/song-transport";

import {
  accentByTrackId,
  labelByTrackId,
  shortLabelByTrackId,
  voiceColorByTrackId,
  waveformGlowColorByTrackId,
  waveformLineColorByTrackId,
} from "@/components/sequencer-theme";
import { StepDetailPanel } from "@/components/step-detail-panel";
import { WaveformCanvas } from "@/components/waveform-canvas";

type StepSelectionState = {
  trackId: TrackId;
  anchorStepIndex: number;
  selectedStepIndexes: number[];
};

type CopiedMelodicEntry = MelodicArrangementEntry & {
  volume: number;
};

type CopiedNoiseEntry = {
  stepIndex: number;
  mode: SongDocument["tracks"]["noise"]["steps"][number]["mode"];
  periodIndex: SongDocument["tracks"]["noise"]["steps"][number]["periodIndex"];
  volume: number;
};

type CopiedSampleEntry = {
  stepIndex: number;
  sampleId: string;
  note: NoteValue;
  playbackRate: number;
  volume: number;
};

type ClipboardState =
  | {
      kind: "melodic";
      trackId: MelodicTrackId;
      startStepIndex: number;
      entries: CopiedMelodicEntry[];
    }
  | {
      kind: "noise";
      trackId: "noise";
      startStepIndex: number;
      entries: CopiedNoiseEntry[];
    }
  | {
      kind: "sample";
      trackId: "sample";
      startStepIndex: number;
      entries: CopiedSampleEntry[];
    };

type GridMetrics = {
  pointerStartX: number;
  pointerStartY: number;
  stepWidth: number;
  stepHeight: number;
  columns: number;
};

type MoveDragState = {
  mode: "move";
  trackId: TrackId;
  metrics: GridMetrics;
  initialSelectedStepIndexes: number[];
  delta: number;
  isActive: boolean;
  isValid: boolean;
};

type ResizeDragState = {
  mode: "resize";
  trackId: MelodicTrackId;
  originStepIndex: number;
  edge: "left" | "right";
  metrics: GridMetrics;
  initialStartStepIndex: number;
  initialLength: number;
  previewStartStepIndex: number;
  previewLength: number;
  isActive: boolean;
};

type DragState = MoveDragState | ResizeDragState;

const dragActivationDistancePx = 8;
const fallbackStepWidthPx = 40;
const fallbackStepHeightPx = 48;
const fallbackStepGapPx = 4;
const mediumViewportQuery = "(min-width: 768px)";

function getStepDurationMs(song: SongDocument) {
  return (60_000 / song.transport.bpm) / song.transport.stepsPerBeat;
}

function isKeyboardTargetEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

export function SequencerMatrix({
  defaultSampleId,
  engine,
  song,
  playbackState,
  nextStep,
  onToggleTrackMute,
  onRequestLoopLengthChange,
  onUpdateTrackVolume,
  onOpenMelodicTrackEditor,
  onOpenTriggerTrackEditor,
  onUpdateMelodicStep,
  onResizeMelodicStep,
  onMoveMelodicSelection,
  onMoveNoiseSelection,
  onMoveSampleSelection,
  onUpdateNoiseStep,
  onUpdateSampleStep,
}: {
  defaultSampleId: string | null;
  engine: AudioEngine | null;
  song: SongDocument;
  playbackState: "stopped" | "playing";
  nextStep: number;
  onToggleTrackMute: (trackId: TrackId) => void;
  onRequestLoopLengthChange: (nextLoopLength: number) => void;
  onUpdateTrackVolume: (trackId: TrackId, volume: number) => void;
  onOpenMelodicTrackEditor: (trackId: MelodicTrackId) => void;
  onOpenTriggerTrackEditor: (trackId: TriggerTrackId) => void;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
  onResizeMelodicStep: (
    trackId: MelodicTrackId,
    stepIndex: number,
    nextStartStepIndex: number,
    nextLength: number,
  ) => void;
  onMoveMelodicSelection: (trackId: MelodicTrackId, selectedStepIndexes: number[], delta: number) => void;
  onMoveNoiseSelection: (selectedStepIndexes: number[], delta: number) => void;
  onMoveSampleSelection: (selectedStepIndexes: number[], delta: number) => void;
  onUpdateNoiseStep: (stepIndex: number, updates: NoiseStepUpdates) => void;
  onUpdateSampleStep: (stepIndex: number, updates: SampleStepUpdates) => void;
}) {
  const [selectionState, setSelectionState] = useState<StepSelectionState | null>(null);
  const [clipboardState, setClipboardState] = useState<ClipboardState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const songRef = useRef(song);
  const moveMelodicSelectionRef = useRef(onMoveMelodicSelection);
  const moveNoiseSelectionRef = useRef(onMoveNoiseSelection);
  const moveSampleSelectionRef = useRef(onMoveSampleSelection);
  const resizeMelodicStepRef = useRef(onResizeMelodicStep);
  const tracks = getOrderedTracks(song);
  songRef.current = song;
  moveMelodicSelectionRef.current = onMoveMelodicSelection;
  moveNoiseSelectionRef.current = onMoveNoiseSelection;
  moveSampleSelectionRef.current = onMoveSampleSelection;
  resizeMelodicStepRef.current = onResizeMelodicStep;

  const handleDeselectStep = () => {
    setSelectionState(null);
  };

  const enableStepAtSelection = (trackId: TrackId, stepIndex: number) => {
    const selectedTrack = song.tracks[trackId];

    switch (selectedTrack.kind) {
      case "pulse":
      case "triangle":
        if (!selectedTrack.steps[stepIndex]?.enabled) {
          onUpdateMelodicStep(selectedTrack.id, stepIndex, { enabled: true });
        }
        return;
      case "noise":
        if (!selectedTrack.steps[stepIndex]?.enabled) {
          onUpdateNoiseStep(stepIndex, { enabled: true });
        }
        return;
      case "sample": {
        const selectedStep = selectedTrack.steps[stepIndex];

        if (selectedStep?.enabled) {
          return;
        }

        const defaultSampleTrigger = getDefaultSampleTrigger(song.samples, defaultSampleId);
        onUpdateSampleStep(stepIndex, {
          enabled: true,
          sampleId: selectedStep.sampleId ?? defaultSampleTrigger.sampleId,
          note: (selectedStep.note as NoteValue) ?? defaultSampleTrigger.note,
          playbackRate: selectedStep.playbackRate ?? defaultSampleTrigger.playbackRate,
        });
      }
    }
  };

  const copySelection = () => {
    if (selectionState === null) {
      return;
    }

    const selectedTrack = song.tracks[selectionState.trackId];

    switch (selectedTrack.kind) {
      case "pulse":
      case "triangle": {
        const entries = getMelodicArrangementEntries(selectedTrack)
          .filter((entry) => selectionState.selectedStepIndexes.includes(entry.stepIndex))
          .map((entry) => ({
            ...entry,
            volume: selectedTrack.steps[entry.stepIndex]?.volume ?? selectedTrack.volume,
          }));

        if (entries.length === 0) {
          return;
        }

        setClipboardState({
          kind: "melodic",
          trackId: selectedTrack.id,
          startStepIndex: Math.min(...entries.map((entry) => entry.stepIndex)),
          entries,
        });
        return;
      }
      case "noise": {
        const entries = selectionState.selectedStepIndexes.flatMap((stepIndex) => {
          const step = selectedTrack.steps[stepIndex];

          return step?.enabled
            ? [
                {
                  stepIndex,
                  mode: step.mode,
                  periodIndex: step.periodIndex,
                  volume: step.volume,
                },
              ]
            : [];
        });

        if (entries.length === 0) {
          return;
        }

        setClipboardState({
          kind: "noise",
          trackId: selectedTrack.id,
          startStepIndex: Math.min(...entries.map((entry) => entry.stepIndex)),
          entries,
        });
        return;
      }
      case "sample": {
        const entries = selectionState.selectedStepIndexes.flatMap((stepIndex) => {
          const step = selectedTrack.steps[stepIndex];

          return step?.enabled && step.sampleId !== null
            ? [
                {
                  stepIndex,
                  sampleId: step.sampleId,
                  note: step.note as NoteValue,
                  playbackRate: step.playbackRate,
                  volume: step.volume,
                },
              ]
            : [];
        });

        if (entries.length === 0) {
          return;
        }

        setClipboardState({
          kind: "sample",
          trackId: selectedTrack.id,
          startStepIndex: Math.min(...entries.map((entry) => entry.stepIndex)),
          entries,
        });
      }
    }
  };

  const pasteSelection = () => {
    if (selectionState === null || clipboardState === null || selectionState.trackId !== clipboardState.trackId) {
      return;
    }

    const targetStartStepIndex = selectionState.anchorStepIndex;
    const stepOffset = targetStartStepIndex - clipboardState.startStepIndex;

    switch (clipboardState.kind) {
      case "melodic": {
        const selectedTrack = song.tracks[clipboardState.trackId];
        const pastedEntries = clipboardState.entries
          .map((entry) => ({
            ...entry,
            stepIndex: entry.stepIndex + stepOffset,
          }))
          .filter((entry) => entry.stepIndex >= 0 && entry.stepIndex < selectedTrack.steps.length)
          .sort((left, right) => left.stepIndex - right.stepIndex);

        if (pastedEntries.length === 0) {
          return;
        }

        const existingEntries = getMelodicArrangementEntries(selectedTrack);
        const conflictingStepIndexes = existingEntries
          .filter((existingEntry) =>
            pastedEntries.some((pastedEntry) =>
              rangesOverlap(
                existingEntry.stepIndex,
                existingEntry.stepIndex + existingEntry.length,
                pastedEntry.stepIndex,
                Math.min(pastedEntry.stepIndex + pastedEntry.length, selectedTrack.steps.length),
              ),
            ),
          )
          .map((entry) => entry.stepIndex);

        conflictingStepIndexes.forEach((stepIndex) => {
          onUpdateMelodicStep(selectedTrack.id, stepIndex, { enabled: false });
        });

        pastedEntries.forEach((entry) => {
          onUpdateMelodicStep(selectedTrack.id, entry.stepIndex, {
            enabled: true,
            note: entry.note,
            length: entry.length,
            ...(selectedTrack.kind === "pulse" ? { duty: entry.duty } : {}),
            volume: entry.volume,
          });
        });

        setSelectionState({
          trackId: selectedTrack.id,
          anchorStepIndex: targetStartStepIndex,
          selectedStepIndexes: pastedEntries.map((entry) => entry.stepIndex),
        });
        return;
      }
      case "noise": {
        const pastedEntries = clipboardState.entries
          .map((entry) => ({
            ...entry,
            stepIndex: entry.stepIndex + stepOffset,
          }))
          .filter((entry) => entry.stepIndex >= 0 && entry.stepIndex < song.tracks.noise.steps.length)
          .sort((left, right) => left.stepIndex - right.stepIndex);

        if (pastedEntries.length === 0) {
          return;
        }

        pastedEntries.forEach((entry) => {
          onUpdateNoiseStep(entry.stepIndex, {
            enabled: true,
            mode: entry.mode,
            periodIndex: entry.periodIndex,
            volume: entry.volume,
          });
        });

        setSelectionState({
          trackId: "noise",
          anchorStepIndex: targetStartStepIndex,
          selectedStepIndexes: pastedEntries.map((entry) => entry.stepIndex),
        });
        return;
      }
      case "sample": {
        const pastedEntries = clipboardState.entries
          .map((entry) => ({
            ...entry,
            stepIndex: entry.stepIndex + stepOffset,
          }))
          .filter((entry) => entry.stepIndex >= 0 && entry.stepIndex < song.tracks.sample.steps.length)
          .sort((left, right) => left.stepIndex - right.stepIndex);

        if (pastedEntries.length === 0) {
          return;
        }

        pastedEntries.forEach((entry) => {
          onUpdateSampleStep(entry.stepIndex, {
            enabled: true,
            sampleId: entry.sampleId,
            note: entry.note,
            playbackRate: entry.playbackRate,
            volume: entry.volume,
          });
        });

        setSelectionState({
          trackId: "sample",
          anchorStepIndex: targetStartStepIndex,
          selectedStepIndexes: pastedEntries.map((entry) => entry.stepIndex),
        });
      }
    }
  };

  const updateDragPreview = (clientX: number, clientY: number) => {
    const currentDragState = dragStateRef.current;

    if (currentDragState === null) {
      return;
    }

    const { metrics } = currentDragState;
    const deltaX = clientX - metrics.pointerStartX;
    const deltaY = clientY - metrics.pointerStartY;
    const shouldActivate =
      currentDragState.isActive || Math.hypot(deltaX, deltaY) >= dragActivationDistancePx;

    if (!shouldActivate) {
      return;
    }

    if (currentDragState.mode === "move") {
      const dragTrack = songRef.current.tracks[currentDragState.trackId];
      const delta = getPointerStepDelta(deltaX, deltaY, metrics);
      const isValid =
        delta !== 0 && validateMovePreview(songRef.current, dragTrack, currentDragState.initialSelectedStepIndexes, delta);

      if (
        currentDragState.delta === delta &&
        currentDragState.isActive === true &&
        currentDragState.isValid === isValid
      ) {
        return;
      }

      const nextDragState: MoveDragState = {
        ...currentDragState,
        delta,
        isActive: true,
        isValid,
      };

      dragStateRef.current = nextDragState;
      setDragState(nextDragState);
      return;
    }

    const delta = getPointerStepDelta(deltaX, deltaY, metrics);
    const nextResizePreview = getResizePreview(
      songRef.current.tracks[currentDragState.trackId],
      currentDragState.originStepIndex,
      currentDragState.edge,
      currentDragState.initialStartStepIndex,
      currentDragState.initialLength,
      delta,
    );

    if (
      currentDragState.previewStartStepIndex === nextResizePreview.startStepIndex &&
      currentDragState.previewLength === nextResizePreview.length &&
      currentDragState.isActive
    ) {
      return;
    }

    const nextDragState: ResizeDragState = {
      ...currentDragState,
      previewStartStepIndex: nextResizePreview.startStepIndex,
      previewLength: nextResizePreview.length,
      isActive: true,
    };

    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  };

  const finishDrag = () => {
    const currentDragState = dragStateRef.current;

    if (currentDragState === null) {
      return;
    }

    if (currentDragState.isActive) {
      suppressClickRef.current = true;

      if (currentDragState.mode === "move") {
        const dragTrack = songRef.current.tracks[currentDragState.trackId];

        if (currentDragState.isValid && currentDragState.delta !== 0) {
          switch (dragTrack.kind) {
            case "pulse":
            case "triangle":
              moveMelodicSelectionRef.current(
                dragTrack.id,
                currentDragState.initialSelectedStepIndexes,
                currentDragState.delta,
              );
              break;
            case "noise":
              moveNoiseSelectionRef.current(currentDragState.initialSelectedStepIndexes, currentDragState.delta);
              break;
            case "sample":
              moveSampleSelectionRef.current(currentDragState.initialSelectedStepIndexes, currentDragState.delta);
              break;
          }

          setSelectionState({
            trackId: currentDragState.trackId,
            anchorStepIndex: currentDragState.initialSelectedStepIndexes[0] + currentDragState.delta,
            selectedStepIndexes: currentDragState.initialSelectedStepIndexes.map(
              (stepIndex) => stepIndex + currentDragState.delta,
            ),
          });
        }
      } else if (
        currentDragState.previewStartStepIndex !== currentDragState.initialStartStepIndex ||
        currentDragState.previewLength !== currentDragState.initialLength
      ) {
        resizeMelodicStepRef.current(
          currentDragState.trackId,
          currentDragState.originStepIndex,
          currentDragState.previewStartStepIndex,
          currentDragState.previewLength,
        );
        setSelectionState({
          trackId: currentDragState.trackId,
          anchorStepIndex: currentDragState.previewStartStepIndex,
          selectedStepIndexes: [currentDragState.previewStartStepIndex],
        });
      }
    }

    dragStateRef.current = null;
    setDragState(null);
  };

  useEffect(() => {
    if (selectionState === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isKeyboardTargetEditable(event.target)) {
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        const loweredKey = event.key.toLowerCase();

        if (loweredKey === "c") {
          copySelection();
          event.preventDefault();
          return;
        }

        if (loweredKey === "v") {
          pasteSelection();
          event.preventDefault();
          return;
        }
      }

      switch (event.key) {
        case "Escape":
          setSelectionState(null);
          event.preventDefault();
          break;
        case "Backspace":
        case "Delete": {
          const currentSelection = selectionState;
          const selectedTrack = song.tracks[currentSelection.trackId];

          switch (selectedTrack.kind) {
            case "pulse":
            case "triangle":
              currentSelection.selectedStepIndexes.forEach((stepIndex) => {
                onUpdateMelodicStep(selectedTrack.id, stepIndex, { enabled: false });
              });
              break;
            case "noise":
              currentSelection.selectedStepIndexes.forEach((stepIndex) => {
                onUpdateNoiseStep(stepIndex, { enabled: false });
              });
              break;
            case "sample":
              currentSelection.selectedStepIndexes.forEach((stepIndex) => {
                onUpdateSampleStep(stepIndex, { enabled: false });
              });
              break;
          }

          setSelectionState(null);
          event.preventDefault();
          break;
        }
        case "Enter": {
          const selectedTrack = song.tracks[selectionState.trackId];
          const selectedStep = selectedTrack.steps[selectionState.anchorStepIndex];

          if (!selectedStep?.enabled) {
            enableStepAtSelection(selectionState.trackId, selectionState.anchorStepIndex);
            event.preventDefault();
          }
          break;
        }
        case "ArrowLeft":
          setSelectionState((prev) => {
            if (prev === null) return null;
            const nextStepIndex = Math.max(0, prev.anchorStepIndex - 1);
            return {
              ...prev,
              anchorStepIndex: nextStepIndex,
              selectedStepIndexes: [nextStepIndex],
            };
          });
          event.preventDefault();
          break;
        case "ArrowRight":
          setSelectionState((prev) => {
            if (prev === null) return null;
            const nextStepIndex = Math.min(song.transport.loopLength - 1, prev.anchorStepIndex + 1);
            return {
              ...prev,
              anchorStepIndex: nextStepIndex,
              selectedStepIndexes: [nextStepIndex],
            };
          });
          event.preventDefault();
          break;
        case "ArrowUp": {
          const currentIndex = trackOrder.indexOf(selectionState.trackId);
          if (currentIndex > 0) {
            setSelectionState({
              trackId: trackOrder[currentIndex - 1],
              anchorStepIndex: selectionState.anchorStepIndex,
              selectedStepIndexes: [selectionState.anchorStepIndex],
            });
          }
          event.preventDefault();
          break;
        }
        case "ArrowDown": {
          const currentIndex = trackOrder.indexOf(selectionState.trackId);
          if (currentIndex < trackOrder.length - 1) {
            setSelectionState({
              trackId: trackOrder[currentIndex + 1],
              anchorStepIndex: selectionState.anchorStepIndex,
              selectedStepIndexes: [selectionState.anchorStepIndex],
            });
          }
          event.preventDefault();
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    clipboardState,
    defaultSampleId,
    onUpdateMelodicStep,
    onUpdateNoiseStep,
    onUpdateSampleStep,
    selectionState,
    song,
    song.transport.loopLength,
  ]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      updateDragPreview(event.clientX, event.clientY);
    };
    const handleMouseMove = (event: MouseEvent) => {
      updateDragPreview(event.clientX, event.clientY);
    };

    const handlePointerEnd = () => {
      finishDrag();
    };
    const handleMouseEnd = () => {
      finishDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseEnd);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseEnd);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <StepRuler
        loopLength={song.transport.loopLength}
        nextStep={nextStep}
        onRequestLoopLengthChange={onRequestLoopLengthChange}
        playbackState={playbackState}
      />
      {tracks.map((track) => {
        const selectedStepIndex = selectionState?.trackId === track.id ? selectionState.anchorStepIndex : null;
        const selectedStepIndexes = selectionState?.trackId === track.id ? selectionState.selectedStepIndexes : [];
        const currentDragState = dragState?.trackId === track.id ? dragState : null;

        return (
          <SequencerRow
            key={track.id}
            defaultSampleId={defaultSampleId}
            engine={engine}
            nextStep={nextStep}
            onDeselectStep={handleDeselectStep}
            onOpenMelodicTrackEditor={onOpenMelodicTrackEditor}
            onOpenTriggerTrackEditor={onOpenTriggerTrackEditor}
            onDragPointerMove={updateDragPreview}
            onDragPointerEnd={finishDrag}
            dragState={currentDragState}
            onResizeMelodicStepStart={(stepIndex, edge, metrics) => {
              const melodicTrack = song.tracks[track.id];

              if ((melodicTrack.kind !== "pulse" && melodicTrack.kind !== "triangle") || !melodicTrack.steps[stepIndex]?.enabled) {
                return;
              }

              const initialLength = melodicTrack.steps[stepIndex]?.length ?? 1;
              const nextDragState: ResizeDragState = {
                mode: "resize",
                trackId: melodicTrack.id,
                originStepIndex: stepIndex,
                edge,
                metrics,
                initialStartStepIndex: stepIndex,
                initialLength,
                previewStartStepIndex: stepIndex,
                previewLength: initialLength,
                isActive: false,
              };
              dragStateRef.current = nextDragState;
              setDragState(nextDragState);
            }}
            onSelectStep={(stepIndex, options) => {
              const resolvedStepIndex = resolveTrackOriginStepIndex(track, stepIndex);
              const isSelectable = isTrackOriginSelectable(track, resolvedStepIndex);

              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }

              if (
                options.shiftKey &&
                selectionState !== null &&
                selectionState.trackId === track.id &&
                isSelectable
              ) {
                const nextSelectedStepIndexes = getTrackSelectableStepIndexes(track).filter(
                  (candidateStepIndex) =>
                    Math.min(selectionState.anchorStepIndex, resolvedStepIndex) <= candidateStepIndex &&
                    candidateStepIndex <= Math.max(selectionState.anchorStepIndex, resolvedStepIndex),
                );

                setSelectionState({
                  trackId: track.id,
                  anchorStepIndex: selectionState.anchorStepIndex,
                  selectedStepIndexes: nextSelectedStepIndexes,
                });
                return;
              }

              setSelectionState({
                trackId: track.id,
                anchorStepIndex: resolvedStepIndex,
                selectedStepIndexes: [resolvedStepIndex],
              });
            }}
            onStartDrag={(stepIndex, metrics, shiftKey) => {
              const resolvedStepIndex = resolveTrackOriginStepIndex(track, stepIndex);

              if (shiftKey || !isTrackOriginSelectable(track, resolvedStepIndex)) {
                return;
              }

              const nextSelectedStepIndexes =
                selectionState?.trackId === track.id && selectionState.selectedStepIndexes.includes(resolvedStepIndex)
                  ? selectionState.selectedStepIndexes
                  : [resolvedStepIndex];

              setSelectionState({
                trackId: track.id,
                anchorStepIndex: nextSelectedStepIndexes[0] ?? resolvedStepIndex,
                selectedStepIndexes: nextSelectedStepIndexes,
              });
              const nextDragState: MoveDragState = {
                mode: "move",
                trackId: track.id,
                metrics,
                initialSelectedStepIndexes: nextSelectedStepIndexes,
                delta: 0,
                isActive: false,
                isValid: false,
              };
              dragStateRef.current = nextDragState;
              setDragState(nextDragState);
            }}
            onToggleTrackMute={onToggleTrackMute}
            onUpdateTrackVolume={onUpdateTrackVolume}
            onUpdateMelodicStep={onUpdateMelodicStep}
            onUpdateNoiseStep={onUpdateNoiseStep}
            onUpdateSampleStep={onUpdateSampleStep}
            playbackState={playbackState}
            samples={song.samples}
            selectedStepIndex={selectedStepIndex}
            selectedStepIndexes={selectedStepIndexes}
            song={song}
            track={track}
          />
        );
      })}
    </div>
  );
}

function resolveTrackOriginStepIndex(track: Track, stepIndex: number) {
  if (track.kind === "pulse" || track.kind === "triangle") {
    const melodicState = getMelodicStepState(track, stepIndex);
    return melodicState.kind === "hold" ? melodicState.startIndex : stepIndex;
  }

  return stepIndex;
}

function isTrackOriginSelectable(track: Track, stepIndex: number) {
  if (track.kind === "pulse" || track.kind === "triangle") {
    return track.steps[stepIndex]?.enabled ?? false;
  }

  return track.steps[stepIndex]?.enabled ?? false;
}

function getTrackSelectableStepIndexes(track: Track) {
  if (track.kind === "pulse" || track.kind === "triangle") {
    return track.steps.flatMap((step, index) => (step.enabled ? [index] : []));
  }

  return track.steps.flatMap((step, index) => (step.enabled ? [index] : []));
}

function validateMovePreview(song: SongDocument, track: Track, selectedStepIndexes: number[], delta: number) {
  switch (track.kind) {
    case "pulse":
    case "triangle":
      return moveMelodicTrackEntries(song, track.id, selectedStepIndexes, delta) !== song;
    case "noise":
      return moveNoiseTrackEntries(song, selectedStepIndexes, delta) !== song;
    case "sample":
      return moveSampleTrackEntries(song, selectedStepIndexes, delta) !== song;
  }
}

/* ─────────── Step Ruler ─────────── */

function StepRuler({
  loopLength,
  nextStep,
  onRequestLoopLengthChange,
  playbackState,
}: {
  loopLength: number;
  nextStep: number;
  onRequestLoopLengthChange: (nextLoopLength: number) => void;
  playbackState: "stopped" | "playing";
}) {
  const canDecrease = loopLength > SONG_LOOP_LENGTH_RANGE.min;
  const canIncrease = loopLength < SONG_LOOP_LENGTH_RANGE.max;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] p-2 backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-3 px-1">
        <div>
          <div className="font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.2em] text-white/30">Pattern Ruler</div>
          <div className="mt-1 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.14em] text-white/38">
            {loopLength} step loop. Select empty steps, then press Enter to add.
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Remove 4 steps"
            disabled={!canDecrease}
            className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={() => {
              onRequestLoopLengthChange(loopLength - SONG_LOOP_LENGTH_RANGE.step);
            }}
          >
            -4
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Add 4 steps"
            disabled={!canIncrease}
            className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] px-2 font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={() => {
              onRequestLoopLengthChange(loopLength + SONG_LOOP_LENGTH_RANGE.step);
            }}
          >
            +4
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-8 gap-1 md:grid-cols-16">
        {Array.from({ length: loopLength }, (_, index) => {
          const isQuarterBoundary = index % 4 === 0;
          const isActive = playbackState === "playing" && nextStep === index;

          return (
            <div
              key={`ruler-step-${index}`}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "rounded-sm py-1.5 text-center font-[var(--oc-mono)] text-[10px] font-medium transition-all",
                isActive
                  ? "oc-playhead-active bg-[var(--oc-play)]/15 text-[var(--oc-play)]"
                  : isQuarterBoundary
                    ? "bg-white/[0.06] text-white/50"
                    : "bg-white/[0.03] text-white/25",
              )}
            >
              {index + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── Sequencer Row ─────────── */

function SequencerRow({
  defaultSampleId,
  dragState,
  engine,
  nextStep,
  onDeselectStep,
  onDragPointerEnd,
  onDragPointerMove,
  onOpenMelodicTrackEditor,
  onOpenTriggerTrackEditor,
  onSelectStep,
  onResizeMelodicStepStart,
  onStartDrag,
  onToggleTrackMute,
  onUpdateTrackVolume,
  onUpdateMelodicStep,
  onUpdateNoiseStep,
  onUpdateSampleStep,
  playbackState,
  samples,
  selectedStepIndex,
  selectedStepIndexes,
  song,
  track,
}: {
  defaultSampleId: string | null;
  dragState: DragState | null;
  engine: AudioEngine | null;
  nextStep: number;
  onDeselectStep: () => void;
  onDragPointerEnd: () => void;
  onDragPointerMove: (clientX: number, clientY: number) => void;
  onOpenMelodicTrackEditor: (trackId: MelodicTrackId) => void;
  onOpenTriggerTrackEditor: (trackId: TriggerTrackId) => void;
  onSelectStep: (stepIndex: number, options: { shiftKey: boolean }) => void;
  onResizeMelodicStepStart: (stepIndex: number, edge: "left" | "right", metrics: GridMetrics) => void;
  onStartDrag: (stepIndex: number, metrics: GridMetrics, shiftKey: boolean) => void;
  onToggleTrackMute: (trackId: TrackId) => void;
  onUpdateTrackVolume: (trackId: TrackId, volume: number) => void;
  onUpdateMelodicStep: (trackId: MelodicTrackId, stepIndex: number, updates: MelodicStepUpdates) => void;
  onUpdateNoiseStep: (stepIndex: number, updates: NoiseStepUpdates) => void;
  onUpdateSampleStep: (stepIndex: number, updates: SampleStepUpdates) => void;
  playbackState: "stopped" | "playing";
  samples: SongDocument["samples"];
  selectedStepIndex: number | null;
  selectedStepIndexes: number[];
  song: SongDocument;
  track: Track;
}) {
  const handleStepClick = (stepIndex: number, shiftKey: boolean) => {
    const resolvedStepIndex = resolveTrackOriginStepIndex(track, stepIndex);
    const isEnabledOrigin = isTrackOriginSelectable(track, resolvedStepIndex);

    onSelectStep(resolvedStepIndex, { shiftKey: shiftKey && isEnabledOrigin });
  };

  const handleStepHover = (stepIndex: number) => {
    if (engine === null) {
      return;
    }

    const stepDurationMs = getStepDurationMs(song);

    switch (track.kind) {
      case "pulse":
      case "triangle": {
        const melodicState = getMelodicStepState(track, stepIndex);

        if (melodicState.kind === "rest") {
          return;
        }

        if (track.kind === "pulse") {
          const sourceStep = track.steps[melodicState.kind === "hold" ? melodicState.startIndex : stepIndex];

          engine.previewNote(
            track.id,
            melodicState.note,
            Math.max(stepDurationMs * melodicState.length, stepDurationMs),
            sourceStep?.duty ?? 0.5,
            sourceStep?.volume ?? 0.25,
          );
          return;
        }

        const sourceStep = track.steps[melodicState.kind === "hold" ? melodicState.startIndex : stepIndex];
        engine.previewNote(
          track.id,
          melodicState.note,
          Math.max(stepDurationMs * melodicState.length, stepDurationMs),
          0.5,
          sourceStep?.volume ?? 0.25,
        );
        return;
      }
      case "noise": {
        const step = track.steps[stepIndex];

        if (!step.enabled) {
          return;
        }

        engine.previewNoiseConfig(step.mode, step.periodIndex);
        return;
      }
      case "sample": {
        const step = track.steps[stepIndex];

        if (!step.enabled || step.sampleId === null) {
          return;
        }

        if (song.meta.engineMode === "authentic") {
          engine.previewSampleTrigger(step.sampleId, step.playbackRate);
          return;
        }

        const sample = samples.find((entry) => entry.id === step.sampleId);

        if (sample === undefined) {
          return;
        }

        engine.previewSampleNote?.(sample.id, sample.baseNote as NoteValue, step.note as NoteValue);

        if (typeof engine.previewSampleNote !== "function") {
          engine.previewSampleTrigger(
            sample.id,
            getFrequencyForNote(step.note as NoteValue) / getFrequencyForNote(sample.baseNote),
          );
        }
      }
    }
  };

  return (
    <div
      className="oc-voice-row grid gap-0 overflow-hidden rounded-lg border border-white/[0.06] bg-[var(--oc-surface)] backdrop-blur lg:grid-cols-[200px_minmax(0,1fr)]"
      style={{ borderLeftColor: voiceColorByTrackId[track.id], borderLeftWidth: "3px" }}
    >
      {/* Voice info panel */}
      <div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: waveformLineColorByTrackId[track.id] }}
            />
            <h3 className="font-[var(--oc-mono)] text-sm font-bold uppercase tracking-[0.12em] text-white">
              {labelByTrackId[track.id]}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-[var(--oc-mono)] text-[8px] font-semibold uppercase tracking-[0.18em]",
                accentByTrackId[track.id],
              )}
            >
              {shortLabelByTrackId[track.id]}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${track.muted ? "Unmute" : "Mute"} ${labelByTrackId[track.id]}`}
              aria-pressed={track.muted}
              className={cn(
                "size-7 text-white/40 hover:bg-white/[0.06] hover:text-white",
                track.muted && "text-[var(--oc-noise)] hover:text-[var(--oc-noise)]",
              )}
              onClick={() => {
                onToggleTrackMute(track.id);
              }}
            >
              {track.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </Button>
          </div>
        </div>

        {/* Inline waveform */}
        <div className="oc-waveform-wrap rounded-sm border border-white/[0.05] bg-black/30">
          <VoiceWaveformPanel engine={engine} track={track} />
        </div>

        {/* Volume readout */}
        <TrackVolumeControl track={track} onUpdateTrackVolume={onUpdateTrackVolume} />
        {track.kind === "pulse" || track.kind === "triangle" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit ${labelByTrackId[track.id]} arrangement as text`}
            className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={() => {
              onOpenMelodicTrackEditor(track.id);
            }}
          >
            Text Edit
          </Button>
        ) : track.kind === "noise" || track.kind === "sample" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit ${labelByTrackId[track.id]} arrangement as text`}
            className="h-7 rounded-md border-white/[0.08] bg-white/[0.03] font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/55 hover:bg-white/[0.08] hover:text-white"
            onClick={() => {
              onOpenTriggerTrackEditor(track.id);
            }}
          >
            Text Edit
          </Button>
        ) : null}
      </div>

      {/* Step grid + detail panel */}
      <div className="p-2">
        <CompactStepGrid
          accentClassName={accentByTrackId[track.id]}
          accentColor={waveformLineColorByTrackId[track.id]}
          dragState={dragState}
          engineMode={song.meta.engineMode}
          nextStep={nextStep}
          onStepHover={handleStepHover}
          onStepClick={handleStepClick}
          onResizeMelodicStepStart={onResizeMelodicStepStart}
          onStepPointerMove={onDragPointerMove}
          onStepPointerUp={onDragPointerEnd}
          onStepPointerDown={onStartDrag}
          playbackState={playbackState}
          samples={samples}
          selectedStepIndexes={selectedStepIndexes}
          track={track}
        />
        {selectedStepIndex !== null ? (
          <StepDetailPanel
            defaultSampleId={defaultSampleId}
            engine={engine}
            onDeselect={onDeselectStep}
            onUpdateMelodicStep={onUpdateMelodicStep}
            onUpdateNoiseStep={onUpdateNoiseStep}
            onUpdateSampleStep={onUpdateSampleStep}
            samples={samples}
            selection={{ trackId: track.id, stepIndex: selectedStepIndex }}
            song={song}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ─────────── Track Volume Control ─────────── */

function TrackVolumeControl({
  track,
  onUpdateTrackVolume,
}: {
  track: Track;
  onUpdateTrackVolume: (trackId: TrackId, volume: number) => void;
}) {
  const volumeInputId = `track-volume-${track.id}`;
  const volumePercent = toTrackVolumePercent(track.volume);

  return (
    <div
      className="rounded-sm border border-white/[0.06] bg-black/20 px-2 py-1.5"
      style={{ ["--oc-track-accent" as string]: waveformLineColorByTrackId[track.id] }}
    >
      <div className="mb-1.5 flex items-center justify-between font-[var(--oc-mono)] text-[9px] uppercase tracking-[0.16em] text-white/30">
        <label htmlFor={volumeInputId} className="text-white/45">
          Level
        </label>
        <span className="text-white/65">{volumePercent}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/20">0</span>
        <input
          id={volumeInputId}
          type="range"
          min={TRACK_VOLUME_PERCENT_RANGE.min}
          max={TRACK_VOLUME_PERCENT_RANGE.max}
          step={TRACK_VOLUME_PERCENT_RANGE.step}
          value={volumePercent}
          aria-label={`${labelByTrackId[track.id]} volume`}
          className={cn("oc-track-volume", track.muted && "opacity-60")}
          onChange={(event) => {
            onUpdateTrackVolume(track.id, Number(event.currentTarget.value) / TRACK_VOLUME_PERCENT_RANGE.max);
          }}
        />
        <span className="font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.14em] text-white/20">100</span>
      </div>
      <div className="mt-1 flex items-center justify-between font-[var(--oc-mono)] text-[8px] uppercase tracking-[0.16em] text-white/25">
        <span>{track.muted ? "Muted bus" : "Bus live"}</span>
        <span>{track.kind}</span>
      </div>
    </div>
  );
}

/* ─────────── Voice Waveform ─────────── */

function VoiceWaveformPanel({
  engine,
  track,
}: {
  engine: AudioEngine | null;
  track: Track;
}) {
  const waveform = useTrackWaveform({
    engine,
    trackId: track.id,
    fallbackWaveform: previewWaveformByTrackId[track.id],
  });

  return (
    <WaveformCanvas
      ariaLabel={`${labelByTrackId[track.id]} waveform`}
      samples={waveform}
      className="h-14 w-full"
      backgroundColor="rgba(7, 8, 14, 0.85)"
      glowColor={waveformGlowColorByTrackId[track.id]}
      lineColor={waveformLineColorByTrackId[track.id]}
    />
  );
}

/* ─────────── Compact Step Grid ─────────── */

type CompactCellData = {
  enabled: boolean;
  label: string;
  volume: number;
};

function getCompactCellData(
  track: Track,
  engineMode: SongDocument["meta"]["engineMode"],
  stepIndex: number,
  samples: SongDocument["samples"],
): CompactCellData {
  switch (track.kind) {
    case "pulse":
    case "triangle":
      return {
        enabled: track.steps[stepIndex]?.enabled ?? false,
        label: track.steps[stepIndex]?.enabled ? track.steps[stepIndex].note : "\u00b7",
        volume: track.steps[stepIndex]?.volume ?? 0,
      };
    case "noise": {
      const step = track.steps[stepIndex];
      const preset = getNoiseTriggerPresetForStep(step);

      return {
        enabled: step.enabled,
        label: step.enabled ? (preset?.shortLabel ?? step.mode[0]) : "\u00b7",
        volume: step.volume,
      };
    }
    case "sample": {
      const step = track.steps[stepIndex];
      const sample = step.sampleId === null ? null : samples.find((s) => s.id === step.sampleId) ?? null;

      return {
        enabled: step.enabled,
        label:
          !step.enabled
            ? "\u00b7"
            : engineMode === "inspired"
              ? step.note
              : sample !== null
                ? sample.name
                : "pcm",
        volume: step.volume,
      };
    }
  }
}

type MelodicArrangementPreviewEntry = {
  stepIndex: number;
  length: number;
  label: string;
  volume: number;
  isSelected: boolean;
  isHovered: boolean;
  isPreview: boolean;
  isPreviewInvalid: boolean;
  activeStepIndex: number | null;
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
  isSelected: boolean;
  isHovered: boolean;
  isPreview: boolean;
  isPreviewInvalid: boolean;
  activeStepOffset: number | null;
};

function CompactStepGrid({
  accentClassName,
  accentColor,
  dragState,
  engineMode,
  nextStep,
  onStepHover,
  onStepClick,
  onResizeMelodicStepStart,
  onStepPointerDown,
  onStepPointerMove,
  onStepPointerUp,
  playbackState,
  samples,
  selectedStepIndexes,
  track,
}: {
  accentClassName: string;
  accentColor: string;
  dragState: DragState | null;
  engineMode: SongDocument["meta"]["engineMode"];
  nextStep: number;
  onStepHover: (stepIndex: number) => void;
  onStepClick: (stepIndex: number, shiftKey: boolean) => void;
  onResizeMelodicStepStart: (stepIndex: number, edge: "left" | "right", metrics: GridMetrics) => void;
  onStepPointerDown: (stepIndex: number, metrics: GridMetrics, shiftKey: boolean) => void;
  onStepPointerMove: (clientX: number, clientY: number) => void;
  onStepPointerUp: () => void;
  playbackState: "stopped" | "playing";
  samples: SongDocument["samples"];
  selectedStepIndexes: number[];
  track: Track;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columnCount = useStepColumnCount();
  const [hoveredMelodicOriginStepIndex, setHoveredMelodicOriginStepIndex] = useState<number | null>(null);

  if (track.kind === "pulse" || track.kind === "triangle") {
    const melodicEntries = getMelodicArrangementEntries(track).map((entry) => ({
      ...entry,
      label: entry.note,
      volume: track.steps[entry.stepIndex]?.volume ?? 0,
      isSelected: selectedStepIndexes.includes(entry.stepIndex),
      isHovered: hoveredMelodicOriginStepIndex === entry.stepIndex,
      isPreview: false,
      isPreviewInvalid: false,
      activeStepIndex:
        playbackState === "playing" && nextStep >= entry.stepIndex && nextStep < entry.stepIndex + entry.length
          ? nextStep
          : null,
    }));
    const previewEntries = getMelodicPreviewEntries(track, dragState, nextStep, playbackState);
    const noteSegments = [...melodicEntries, ...previewEntries].flatMap((entry) =>
      getMelodicSegments(entry, columnCount),
    );
    const rowCount = Math.ceil(track.steps.length / columnCount);

    return (
      <div
        ref={gridRef}
        className="relative"
        role="row"
        onMouseLeave={() => {
          setHoveredMelodicOriginStepIndex(null);
        }}
      >
        <div className="grid grid-cols-8 gap-1 md:grid-cols-16">
          {track.steps.map((_, index) => {
            const isQuarterBoundary = index % 4 === 0;
            const melodicState = getMelodicStepState(track, index);
            const isCovered = melodicState.kind === "hold";
            const isOrigin = melodicState.kind === "start";
            const isOccupiedByNote = isCovered || isOrigin;
            const isActive = playbackState === "playing" && nextStep === index && !isCovered && !isOrigin;
            const isSelectedOrigin = selectedStepIndexes.includes(index);

            return (
            <button
              key={`${track.id}-grid-cell-${index}`}
              type="button"
              data-step-index={index}
              aria-hidden={isCovered || isOrigin}
              aria-current={isActive ? "step" : undefined}
              aria-label={isCovered || isOrigin ? undefined : `${labelByTrackId[track.id]} step ${index + 1}`}
              aria-selected={!isOccupiedByNote && isSelectedOrigin ? true : undefined}
              className={cn(
                "relative z-0 flex h-12 flex-col items-center justify-center gap-0.5 rounded-sm border font-[var(--oc-mono)] text-[10px] transition-all",
                isOccupiedByNote
                  ? "pointer-events-none border-transparent bg-transparent text-transparent shadow-none"
                  : isQuarterBoundary
                    ? "border-white/[0.08] bg-white/[0.04] text-white/30"
                    : "border-white/[0.05] bg-white/[0.02] text-white/20",
                isActive && "oc-playhead-active border-[var(--oc-play)]/60 bg-[var(--oc-play)]/10",
                !isOccupiedByNote && isSelectedOrigin && "ring-2 ring-offset-0",
              )}
              style={!isOccupiedByNote && isSelectedOrigin ? { ["--tw-ring-color" as string]: accentColor } : undefined}
              onMouseEnter={() => {
                setHoveredMelodicOriginStepIndex(null);
                onStepHover(index);
              }}
                onClick={(event) => {
                  onStepClick(index, event.shiftKey);
                }}
              >
                <span className={cn("text-[8px] leading-none text-white/30", isOccupiedByNote && "text-transparent")}>
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "max-w-full truncate px-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.06em] text-white/20",
                    isOccupiedByNote && "text-transparent",
                  )}
                >
                  {isOccupiedByNote ? "" : "\u00b7"}
                </span>
              </button>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute inset-0 grid grid-cols-8 gap-1 md:grid-cols-16"
          style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, ${fallbackStepHeightPx}px))` }}
        >
          {noteSegments.map((segment) => (
            <MelodicNoteSegmentButton
              key={`${track.id}-${segment.originStepIndex}-${segment.rowIndex}-${segment.columnStart}-${segment.isPreview ? "preview" : "note"}`}
              accentClassName={accentClassName}
              accentColor={accentColor}
              gridRef={gridRef}
              segment={segment}
              track={track}
              onClick={onStepClick}
              onHover={onStepHover}
              onHoverStateChange={setHoveredMelodicOriginStepIndex}
              onMoveStart={onStepPointerDown}
              onPointerMove={onStepPointerMove}
              onPointerUp={onStepPointerUp}
              onResizeStart={onResizeMelodicStepStart}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={gridRef} className="grid grid-cols-8 gap-1 md:grid-cols-16" role="row">
      {track.steps.map((_, index) => {
        const isActive = playbackState === "playing" && nextStep === index;
        const isSelected = selectedStepIndexes.includes(index);
        const cellData = getCompactCellData(track, engineMode, index, samples);

        return (
          <CompactStepCell
            key={`${track.id}-step-${index}`}
            accentClassName={accentClassName}
            accentColor={accentColor}
            ariaLabel={`${labelByTrackId[track.id]} step ${index + 1}`}
            enabled={cellData.enabled}
            index={index}
            isActive={isActive}
            isDragPreview={
              dragState?.mode === "move" &&
              dragState.isActive &&
              (dragState.initialSelectedStepIndexes.includes(index - dragState.delta) || false)
            }
            isDragPreviewInvalid={dragState?.mode === "move" && dragState.isActive ? !dragState.isValid : false}
            isSelected={isSelected}
            label={cellData.label}
            volume={cellData.volume}
            onHover={() => {
              onStepHover(index);
            }}
            onClick={(event) => {
              onStepClick(index, event.shiftKey);
            }}
            onPointerDown={(event) => {
              onStepPointerDown(
                index,
                getGridMetrics(event.currentTarget, gridRef.current, columnCount, event.clientX, event.clientY),
                event.shiftKey,
              );
            }}
            onPointerMove={(event) => {
              onStepPointerMove(event.clientX, event.clientY);
            }}
            onPointerUp={() => {
              onStepPointerUp();
            }}
          />
        );
      })}
    </div>
  );
}

/* ─────────── Compact Step Cell ─────────── */

function CompactStepCell({
  accentClassName,
  accentColor,
  ariaLabel,
  enabled,
  index,
  isActive,
  isDragPreview,
  isDragPreviewInvalid,
  isSelected,
  label,
  volume,
  onHover,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  accentClassName: string;
  accentColor: string;
  ariaLabel: string;
  enabled: boolean;
  index: number;
  isActive: boolean;
  isDragPreview: boolean;
  isDragPreviewInvalid: boolean;
  isSelected: boolean;
  label: string;
  volume: number;
  onHover: () => void;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
}) {
  const isQuarterBoundary = index % 4 === 0;

  return (
    <button
      type="button"
      data-step-index={index}
      aria-current={isActive ? "step" : undefined}
      aria-label={ariaLabel}
      aria-selected={isSelected || undefined}
      className={cn(
        "oc-step-cell relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-sm border font-[var(--oc-mono)] text-[10px] transition-all",
        enabled
          ? `${accentClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`
          : isQuarterBoundary
            ? "border-white/[0.08] bg-white/[0.04] text-white/30"
            : "border-white/[0.05] bg-white/[0.02] text-white/20",
        isDragPreview && (isDragPreviewInvalid ? "border-red-400/80 bg-red-500/10" : "border-white/30 bg-white/10"),
        isActive && "oc-playhead-active border-[var(--oc-play)]/60 bg-[var(--oc-play)]/10 text-white",
        isSelected && "ring-2 ring-offset-0",
      )}
      style={isSelected ? { ["--tw-ring-color" as string]: accentColor } : undefined}
      onMouseEnter={onHover}
      onClick={onClick}
      onMouseDown={(event) => {
        onPointerDown(event as unknown as ReactPointerEvent<HTMLButtonElement>);
      }}
      onMouseMove={(event) => {
        onPointerMove(event as unknown as ReactPointerEvent<HTMLButtonElement>);
      }}
      onMouseUp={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <span className="text-[8px] leading-none text-white/30">{index + 1}</span>
      <span
        className={cn(
          "max-w-full truncate px-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.06em]",
          enabled ? "text-inherit" : "text-white/20",
        )}
      >
        {label}
      </span>

      {enabled ? (
        <div className="h-[3px] w-3/4 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${volume * 100}%`, backgroundColor: accentColor }}
          />
        </div>
      ) : null}
    </button>
  );
}

function MelodicNoteSegmentButton({
  accentClassName,
  accentColor,
  gridRef,
  onClick,
  onHover,
  onHoverStateChange,
  onMoveStart,
  onPointerMove,
  onPointerUp,
  onResizeStart,
  segment,
  track,
}: {
  accentClassName: string;
  accentColor: string;
  gridRef: { current: HTMLDivElement | null };
  onClick: (stepIndex: number, shiftKey: boolean) => void;
  onHover: (stepIndex: number) => void;
  onHoverStateChange: (stepIndex: number | null) => void;
  onMoveStart: (stepIndex: number, metrics: GridMetrics, shiftKey: boolean) => void;
  onPointerMove: (clientX: number, clientY: number) => void;
  onPointerUp: () => void;
  onResizeStart: (stepIndex: number, edge: "left" | "right", metrics: GridMetrics) => void;
  segment: MelodicSegment;
  track: Track;
}) {
  const bodyLabel = segment.isFirstSegment
    ? `${labelByTrackId[track.id]} step ${segment.originStepIndex + 1}`
    : `${labelByTrackId[track.id]} step ${segment.originStepIndex + 1} continuation`;
  const startMove = (clientX: number, clientY: number, shiftKey: boolean, currentTarget: HTMLElement) => {
    if (segment.isPreview) {
      return;
    }

    onMoveStart(
      segment.originStepIndex,
      getGridMetrics(currentTarget, gridRef.current, undefined, clientX, clientY),
      shiftKey,
    );
  };
  const startResize = (
    eventTarget: HTMLElement,
    edge: "left" | "right",
    clientX: number,
    clientY: number,
  ) => {
    onResizeStart(
      segment.originStepIndex,
      edge,
      getGridMetrics(eventTarget, gridRef.current, undefined, clientX, clientY),
    );
  };

  return (
    <button
      type="button"
      data-note-origin-step={segment.originStepIndex}
      aria-current={segment.activeStepOffset !== null ? "step" : undefined}
      aria-label={bodyLabel}
      aria-selected={segment.isSelected || undefined}
      className={cn(
        "pointer-events-auto relative z-10 flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-sm border px-2 py-1 text-left font-[var(--oc-mono)] text-[10px] transition-all",
        segment.isPreview
          ? segment.isPreviewInvalid
            ? "border-red-400/80 bg-red-500/10 text-white/75"
            : "border-white/30 bg-white/10 text-white/80"
          : `${accentClassName} shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`,
        segment.isSelected && "ring-2 ring-offset-0",
      )}
      style={{
        gridColumn: `${segment.columnStart} / span ${segment.columnSpan}`,
        gridRow: segment.rowIndex + 1,
        ...(segment.isSelected ? { ["--tw-ring-color" as string]: accentColor } : {}),
      }}
      onMouseEnter={() => {
        onHoverStateChange(segment.originStepIndex);
        onHover(segment.originStepIndex);
      }}
      onClick={(event) => {
        onClick(segment.originStepIndex, event.shiftKey);
      }}
      onPointerDown={(event) => {
        startMove(event.clientX, event.clientY, event.shiftKey, event.currentTarget);
      }}
      onMouseDown={(event) => {
        startMove(event.clientX, event.clientY, event.shiftKey, event.currentTarget);
      }}
      onPointerMove={(event) => {
        onPointerMove(event.clientX, event.clientY);
      }}
      onMouseMove={(event) => {
        onPointerMove(event.clientX, event.clientY);
      }}
      onPointerUp={onPointerUp}
      onMouseUp={onPointerUp}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-1 z-0 grid text-[8px] leading-none text-white/30"
        style={{ gridTemplateColumns: `repeat(${segment.columnSpan}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: segment.columnSpan }, (_, offset) => (
          <span key={`${segment.segmentStepIndex + offset}-step-number`} className="text-center">
            {segment.segmentStepIndex + offset + 1}
          </span>
        ))}
      </div>
      {segment.activeStepOffset !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-0 rounded-sm border border-[var(--oc-play)]/60 bg-[var(--oc-play)]/10"
          style={{
            width: `${100 / segment.columnSpan}%`,
            left: `${(100 / segment.columnSpan) * segment.activeStepOffset}%`,
          }}
        />
      ) : null}
      {segment.isFirstSegment ? (
        <span className="mt-3 truncate text-[9px] font-semibold uppercase leading-none tracking-[0.06em] text-inherit">
          {segment.label}
        </span>
      ) : null}
      {segment.isFirstSegment ? (
        <div
          className="mt-auto h-[3px] overflow-hidden rounded-full bg-white/[0.08]"
          style={{ width: `${100 / segment.columnSpan}%` }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${segment.volume * 100}%`, backgroundColor: accentColor }}
          />
        </div>
      ) : null}
      {!segment.isPreview && segment.isFirstSegment ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Resize start of ${labelByTrackId[track.id]} step ${segment.originStepIndex + 1}`}
          className="absolute inset-y-0 left-0 w-3 cursor-ew-resize rounded-l-sm border-l border-white/35 bg-transparent hover:bg-white/8"
          onPointerDown={(event) => {
            event.stopPropagation();
            startResize(event.currentTarget, "left", event.clientX, event.clientY);
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
            startResize(event.currentTarget, "left", event.clientX, event.clientY);
          }}
        />
      ) : null}
      {!segment.isPreview && segment.isLastSegment ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Resize end of ${labelByTrackId[track.id]} step ${segment.originStepIndex + 1}`}
          className="absolute inset-y-0 right-0 w-3 cursor-ew-resize rounded-r-sm border-r border-white/35 bg-transparent hover:bg-white/8"
          onPointerDown={(event) => {
            event.stopPropagation();
            startResize(event.currentTarget, "right", event.clientX, event.clientY);
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
            startResize(event.currentTarget, "right", event.clientX, event.clientY);
          }}
        />
      ) : null}
    </button>
  );
}

function getMelodicPreviewEntries(
  track: Extract<Track, { kind: "pulse" | "triangle" }>,
  dragState: DragState | null,
  nextStep: number,
  playbackState: "stopped" | "playing",
): MelodicArrangementPreviewEntry[] {
  if (dragState === null || !dragState.isActive) {
    return [];
  }

  if (dragState.mode === "move") {
    if (dragState.trackId !== track.id || dragState.delta === 0) {
      return [];
    }

    return dragState.initialSelectedStepIndexes.flatMap((stepIndex) => {
      const step = track.steps[stepIndex];

      if (!step?.enabled) {
        return [];
      }

      return [{
        stepIndex: stepIndex + dragState.delta,
        length: step.length,
        label: step.note,
        volume: step.volume,
        isSelected: false,
        isHovered: false,
        isPreview: true,
        isPreviewInvalid: !dragState.isValid,
        activeStepIndex:
          playbackState === "playing" &&
          nextStep >= stepIndex + dragState.delta &&
          nextStep < stepIndex + dragState.delta + step.length
            ? nextStep
            : null,
      }];
    });
  }

  if (dragState.trackId !== track.id) {
    return [];
  }

  const step = track.steps[dragState.originStepIndex];

  if (!step?.enabled) {
    return [];
  }

  return [{
    stepIndex: dragState.previewStartStepIndex,
    length: dragState.previewLength,
    label: step.note,
    volume: step.volume,
    isSelected: false,
    isHovered: false,
    isPreview: true,
    isPreviewInvalid: false,
    activeStepIndex:
      playbackState === "playing" &&
      nextStep >= dragState.previewStartStepIndex &&
      nextStep < dragState.previewStartStepIndex + dragState.previewLength
      ? nextStep
      : null,
  }];
}

function getMelodicSegments(
  entry: MelodicArrangementPreviewEntry,
  columns: number,
): MelodicSegment[] {
  if (entry.stepIndex < 0 || entry.length <= 0) {
    return [];
  }

  const segments: MelodicSegment[] = [];
  let currentIndex = entry.stepIndex;
  let remainingLength = entry.length;
  let segmentIndex = 0;

  while (remainingLength > 0) {
    const rowIndex = Math.floor(currentIndex / columns);
    const columnStart = (currentIndex % columns) + 1;
    const columnSpan = Math.min(remainingLength, columns - (currentIndex % columns));
    const activeStepOffset =
      entry.activeStepIndex !== null &&
      currentIndex <= entry.activeStepIndex &&
      entry.activeStepIndex < currentIndex + columnSpan
        ? entry.activeStepIndex - currentIndex
        : null;

    segments.push({
      originStepIndex: entry.stepIndex,
      segmentStepIndex: currentIndex,
      rowIndex,
      columnStart,
      columnSpan,
      isFirstSegment: segmentIndex === 0,
      isLastSegment: remainingLength === columnSpan,
      label: entry.label,
      volume: entry.volume,
      isSelected: entry.isSelected,
      isHovered: entry.isHovered,
      isPreview: entry.isPreview,
      isPreviewInvalid: entry.isPreviewInvalid,
      activeStepOffset,
    });

    currentIndex += columnSpan;
    remainingLength -= columnSpan;
    segmentIndex += 1;
  }

  return segments;
}

function useStepColumnCount() {
  const [columnCount, setColumnCount] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return 16;
    }

    return window.matchMedia(mediumViewportQuery).matches ? 16 : 8;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(mediumViewportQuery);
    const updateColumnCount = () => {
      setColumnCount(mediaQuery.matches ? 16 : 8);
    };

    updateColumnCount();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateColumnCount);
    } else {
      mediaQuery.addListener(updateColumnCount);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", updateColumnCount);
      } else {
        mediaQuery.removeListener(updateColumnCount);
      }
    };
  }, []);

  return columnCount;
}

function getGridMetrics(
  element: HTMLElement,
  gridElement: HTMLElement | null,
  columns: number | undefined,
  clientX: number,
  clientY: number,
): GridMetrics {
  const targetGrid = gridElement ?? element.closest("[role='row']");
  const firstCell = targetGrid instanceof HTMLElement ? targetGrid.querySelector<HTMLElement>("[data-step-index='0']") : null;
  const nextCell =
    targetGrid instanceof HTMLElement
      ? targetGrid.querySelector<HTMLElement>(`[data-step-index='${(columns ?? 16) > 1 ? 1 : 0}']`)
      : null;
  const nextRowCell =
    targetGrid instanceof HTMLElement && columns !== undefined
      ? targetGrid.querySelector<HTMLElement>(`[data-step-index='${columns}']`)
      : null;
  const referenceRect = firstCell?.getBoundingClientRect() ?? element.getBoundingClientRect();
  const nextCellRect = nextCell?.getBoundingClientRect() ?? null;
  const nextRowRect = nextRowCell?.getBoundingClientRect() ?? null;
  const horizontalGap = nextCellRect === null ? fallbackStepGapPx : Math.max(0, nextCellRect.left - referenceRect.right);
  const verticalGap = nextRowRect === null ? fallbackStepGapPx : Math.max(0, nextRowRect.top - referenceRect.bottom);
  const resolvedColumns =
    columns ??
    (targetGrid instanceof HTMLElement && typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(mediumViewportQuery).matches
        ? 16
        : 8
      : 16);

  return {
    pointerStartX: clientX,
    pointerStartY: clientY,
    stepWidth: referenceRect.width + horizontalGap || fallbackStepWidthPx,
    stepHeight: referenceRect.height + verticalGap || fallbackStepHeightPx,
    columns: resolvedColumns,
  };
}

function getPointerStepDelta(deltaX: number, deltaY: number, metrics: GridMetrics) {
  const deltaColumns = Math.round(deltaX / metrics.stepWidth);
  const deltaRows = Math.round(deltaY / metrics.stepHeight);
  return deltaRows * metrics.columns + deltaColumns;
}

function getResizePreview(
  track: Extract<Track, { kind: "pulse" | "triangle" }>,
  originStepIndex: number,
  edge: "left" | "right",
  initialStartStepIndex: number,
  initialLength: number,
  delta: number,
) {
  const initialEndExclusive = initialStartStepIndex + initialLength;
  const entries = getMelodicArrangementEntries(track);
  const entryIndex = entries.findIndex((entry) => entry.stepIndex === originStepIndex);
  const previousEntry = entryIndex > 0 ? entries[entryIndex - 1] : null;
  const nextEntry = entryIndex < entries.length - 1 ? entries[entryIndex + 1] : null;
  const minimumStart = previousEntry === null ? 0 : previousEntry.stepIndex + previousEntry.length;
  const maximumEndExclusive = nextEntry === null ? track.steps.length : nextEntry.stepIndex;

  if (edge === "right") {
    const endExclusive = Math.max(
      initialStartStepIndex + 1,
      Math.min(initialEndExclusive + delta, maximumEndExclusive, track.steps.length),
    );

    return {
      startStepIndex: initialStartStepIndex,
      length: endExclusive - initialStartStepIndex,
    };
  }

  const startStepIndex = Math.max(
    minimumStart,
    Math.min(initialStartStepIndex + delta, initialEndExclusive - 1),
  );

  return {
    startStepIndex,
    length: initialEndExclusive - startStepIndex,
  };
}
